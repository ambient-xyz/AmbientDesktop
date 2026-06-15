package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/ambient-xyz/AmbientDesktop/sidecars/google/internal/gmail"
	"github.com/ambient-xyz/AmbientDesktop/sidecars/google/internal/googlecalendar"
	"github.com/ambient-xyz/AmbientDesktop/sidecars/google/internal/googledrive"
	"github.com/ambient-xyz/AmbientDesktop/sidecars/google/internal/secretbox"
)

const (
	sidecarName            = "ambient-google-sidecar"
	sidecarVersion         = "0.1.0"
	protocolVersion        = "2026-05-03"
	defaultOperationTimout = 30 * time.Second
)

type sidecarRequest struct {
	ID          string          `json:"id"`
	Method      string          `json:"method"`
	AccessToken string          `json:"accessToken,omitempty"`
	AccountHint string          `json:"accountHint,omitempty"`
	Input       json.RawMessage `json:"input,omitempty"`
	Options     sidecarOptions  `json:"options,omitempty"`
}

type sidecarOptions struct {
	TimeoutMs int `json:"timeoutMs,omitempty"`
}

type sidecarResponse struct {
	ID     string        `json:"id,omitempty"`
	OK     bool          `json:"ok"`
	Result any           `json:"result,omitempty"`
	Error  *sidecarError `json:"error,omitempty"`
}

type sidecarError struct {
	Code         string `json:"code"`
	Message      string `json:"message"`
	GoogleStatus int    `json:"googleStatus,omitempty"`
	Retryable    bool   `json:"retryable"`
	ScopeHint    string `json:"scopeHint,omitempty"`
}

func (e sidecarError) Error() string {
	return e.Message
}

type services struct {
	gmail    *gmail.Service
	calendar *googlecalendar.Service
	drive    *googledrive.Service
}

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "--version", "version":
			fmt.Printf("%s %s protocol=%s\n", sidecarName, sidecarVersion, protocolVersion)
			return
		}
	}
	svc := services{
		gmail:    gmail.New("", "", "", secretbox.New("ambient-google-sidecar-stateless")),
		calendar: googlecalendar.New(),
		drive:    googledrive.New(),
	}
	decoder := json.NewDecoder(os.Stdin)
	encoder := json.NewEncoder(os.Stdout)
	for {
		var req sidecarRequest
		if err := decoder.Decode(&req); err != nil {
			if errors.Is(err, io.EOF) {
				return
			}
			_ = encoder.Encode(errorResponse("", normalizeError(fmt.Errorf("decode request: %w", err))))
			continue
		}
		resp := handleRequest(context.Background(), svc, req)
		_ = encoder.Encode(resp)
	}
}

func handleRequest(parent context.Context, svc services, req sidecarRequest) sidecarResponse {
	method := strings.TrimSpace(req.Method)
	if method == "" {
		return errorResponse(req.ID, sidecarError{Code: "invalid_request", Message: "method is required"})
	}
	if method == "sidecar.version" {
		return successResponse(req.ID, map[string]any{
			"name":            sidecarName,
			"version":         sidecarVersion,
			"protocolVersion": protocolVersion,
			"methods":         supportedMethods(),
		})
	}
	if strings.TrimSpace(req.AccessToken) == "" {
		return errorResponse(req.ID, sidecarError{Code: "missing_access_token", Message: "accessToken is required"})
	}
	timeout := defaultOperationTimout
	if req.Options.TimeoutMs > 0 {
		timeout = time.Duration(req.Options.TimeoutMs) * time.Millisecond
	}
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()
	result, err := dispatch(ctx, svc, req)
	if err != nil {
		return errorResponse(req.ID, normalizeError(err))
	}
	return successResponse(req.ID, result)
}

func dispatch(ctx context.Context, svc services, req sidecarRequest) (any, error) {
	token := gmail.TokenEnvelope{AccessToken: strings.TrimSpace(req.AccessToken), TokenType: "Bearer"}
	switch req.Method {
	case "gmail.search":
		var input struct {
			Query           string   `json:"query"`
			PageSize        int      `json:"pageSize"`
			PageToken       string   `json:"pageToken"`
			LabelIDs        []string `json:"labelIds"`
			ExcludeLabelIDs []string `json:"excludeLabelIds"`
			UnlabeledOnly   bool     `json:"unlabeledOnly"`
			GroupByThread   bool     `json:"groupByThread"`
			ThreadOrder     string   `json:"threadOrder"`
			MessageOrder    string   `json:"messageOrder"`
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		return svc.gmail.ListMessages(ctx, token, gmail.ListMessagesOptions{
			Query:           input.Query,
			PageSize:        input.PageSize,
			PageToken:       input.PageToken,
			LabelIDs:        input.LabelIDs,
			ExcludeLabelIDs: input.ExcludeLabelIDs,
			UnlabeledOnly:   input.UnlabeledOnly,
			GroupByThread:   input.GroupByThread,
			ThreadOrder:     input.ThreadOrder,
			MessageOrder:    input.MessageOrder,
		})
	case "gmail.readThread":
		var input struct {
			ThreadID     string `json:"threadId"`
			MessageOrder string `json:"messageOrder"`
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		if strings.TrimSpace(input.ThreadID) == "" {
			return nil, fmt.Errorf("threadId is required")
		}
		return svc.gmail.GetThread(ctx, token, input.ThreadID, gmail.GetThreadOptions{MessageOrder: input.MessageOrder})
	case "gmail.readAttachment":
		var input gmail.AttachmentRequest
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		return svc.gmail.GetAttachment(ctx, token, input)
	case "gmail.listLabels":
		return svc.gmail.ListLabels(ctx, token)
	case "gmail.createDraft":
		var input draftInput
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		draft, err := input.toDraftRequest()
		if err != nil {
			return nil, err
		}
		return svc.gmail.CreateDraft(ctx, token, draft)
	case "gmail.updateDraft":
		var input struct {
			DraftID string `json:"draftId"`
			draftInput
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		if strings.TrimSpace(input.DraftID) == "" {
			return nil, fmt.Errorf("draftId is required")
		}
		draft, err := input.toDraftRequest()
		if err != nil {
			return nil, err
		}
		return svc.gmail.UpdateDraft(ctx, token, input.DraftID, draft)
	case "gmail.deleteDraft":
		var input struct {
			DraftID string `json:"draftId"`
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		if err := svc.gmail.DeleteDraft(ctx, token, input.DraftID); err != nil {
			return nil, err
		}
		return map[string]any{"deleted": true}, nil
	case "gmail.sendDraft":
		var input struct {
			DraftID string `json:"draftId"`
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		return svc.gmail.SendDraft(ctx, token, input.DraftID)
	case "calendar.listCalendars":
		return svc.calendar.ListCalendars(ctx, token)
	case "calendar.listEvents":
		var input struct {
			CalendarID string `json:"calendarId"`
			TimeMin    string `json:"timeMin"`
			TimeMax    string `json:"timeMax"`
			MaxResults int    `json:"maxResults"`
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		return svc.calendar.ListEvents(ctx, token, input.CalendarID, parseOptionalTime(input.TimeMin), parseOptionalTime(input.TimeMax), input.MaxResults)
	case "calendar.readEvent":
		var input struct {
			CalendarID string `json:"calendarId"`
			EventID    string `json:"eventId"`
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		return svc.calendar.GetEvent(ctx, token, input.CalendarID, input.EventID)
	case "calendar.freeBusy":
		var input struct {
			CalendarIDs []string `json:"calendarIds"`
			TimeMin     string   `json:"timeMin"`
			TimeMax     string   `json:"timeMax"`
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		timeMin, err := parseRequiredTime(input.TimeMin, "timeMin")
		if err != nil {
			return nil, err
		}
		timeMax, err := parseRequiredTime(input.TimeMax, "timeMax")
		if err != nil {
			return nil, err
		}
		return svc.calendar.FreeBusy(ctx, token, input.CalendarIDs, timeMin, timeMax)
	case "calendar.createEvent":
		var input calendarWriteInput
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		req, err := input.toCreateRequest()
		if err != nil {
			return nil, err
		}
		return svc.calendar.CreateEvent(ctx, token, input.CalendarID, req)
	case "calendar.updateEvent":
		var input calendarWriteInput
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		if strings.TrimSpace(input.EventID) == "" {
			return nil, fmt.Errorf("eventId is required")
		}
		req, err := input.toUpdateRequest()
		if err != nil {
			return nil, err
		}
		return svc.calendar.UpdateEvent(ctx, token, input.CalendarID, input.EventID, req)
	case "calendar.deleteEvent":
		var input struct {
			CalendarID string `json:"calendarId"`
			EventID    string `json:"eventId"`
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		if err := svc.calendar.DeleteEvent(ctx, token, input.CalendarID, input.EventID); err != nil {
			return nil, err
		}
		return map[string]any{"deleted": true}, nil
	case "drive.search":
		var input googledrive.ListFilesOptions
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		return svc.drive.ListFiles(ctx, token, input)
	case "drive.readFile":
		var input struct {
			FileID string `json:"fileId"`
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		return svc.drive.GetFile(ctx, token, input.FileID)
	case "drive.listSharedDrives":
		var input struct {
			PageSize int `json:"pageSize"`
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		return svc.drive.ListSharedDrives(ctx, token, input.PageSize)
	case "drive.createFile":
		var input driveFileInput
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		file, err := input.toCreateFileRequest()
		if err != nil {
			return nil, err
		}
		return svc.drive.CreateFile(ctx, token, file)
	case "drive.createFolder":
		var input googledrive.CreateFolderRequest
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		return svc.drive.CreateFolder(ctx, token, input)
	case "drive.updateFile":
		var input struct {
			FileID string `json:"fileId"`
			googledrive.UpdateFileRequest
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		return svc.drive.UpdateFile(ctx, token, input.FileID, input.UpdateFileRequest)
	case "drive.copyFile":
		var input struct {
			FileID string `json:"fileId"`
			googledrive.CopyFileRequest
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		return svc.drive.CopyFile(ctx, token, input.FileID, input.CopyFileRequest)
	case "drive.trashFile":
		var input struct {
			FileID string `json:"fileId"`
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		return svc.drive.TrashFile(ctx, token, input.FileID)
	case "drive.listPermissions":
		var input struct {
			FileID string `json:"fileId"`
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		return svc.drive.ListPermissions(ctx, token, input.FileID)
	case "drive.createPermission":
		var input struct {
			FileID string `json:"fileId"`
			googledrive.CreatePermissionRequest
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		return svc.drive.CreatePermission(ctx, token, input.FileID, input.CreatePermissionRequest)
	case "drive.updatePermission":
		var input struct {
			FileID       string `json:"fileId"`
			PermissionID string `json:"permissionId"`
			googledrive.UpdatePermissionRequest
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		return svc.drive.UpdatePermission(ctx, token, input.FileID, input.PermissionID, input.UpdatePermissionRequest)
	case "drive.deletePermission":
		var input struct {
			FileID       string `json:"fileId"`
			PermissionID string `json:"permissionId"`
		}
		if err := decodeInput(req.Input, &input); err != nil {
			return nil, err
		}
		if err := svc.drive.DeletePermission(ctx, token, input.FileID, input.PermissionID); err != nil {
			return nil, err
		}
		return map[string]any{"deleted": true}, nil
	default:
		return nil, sidecarError{Code: "unknown_method", Message: "unknown sidecar method: " + req.Method}
	}
}

type draftInput struct {
	To          []string                  `json:"to"`
	Cc          []string                  `json:"cc"`
	Bcc         []string                  `json:"bcc"`
	Subject     string                    `json:"subject"`
	Body        string                    `json:"body"`
	ThreadID    string                    `json:"threadId"`
	Attachments []outboundAttachmentInput `json:"attachments"`
}

type outboundAttachmentInput struct {
	Filename      string `json:"filename"`
	MimeType      string `json:"mimeType"`
	ContentBase64 string `json:"contentBase64"`
}

func (d draftInput) toDraftRequest() (gmail.DraftRequest, error) {
	attachments, err := decodeAttachments(d.Attachments)
	if err != nil {
		return gmail.DraftRequest{}, err
	}
	return gmail.DraftRequest{
		To:          d.To,
		Cc:          d.Cc,
		Bcc:         d.Bcc,
		Subject:     d.Subject,
		Body:        d.Body,
		ThreadID:    d.ThreadID,
		Attachments: attachments,
	}, nil
}

type driveFileInput struct {
	Name          string `json:"name"`
	MimeType      string `json:"mimeType"`
	Content       string `json:"content"`
	ContentBase64 string `json:"contentBase64"`
	FolderID      string `json:"folderId"`
}

func (d driveFileInput) toCreateFileRequest() (googledrive.CreateFileRequest, error) {
	content := []byte(d.Content)
	if strings.TrimSpace(d.ContentBase64) != "" {
		decoded, err := decodeBase64(d.ContentBase64)
		if err != nil {
			return googledrive.CreateFileRequest{}, err
		}
		content = decoded
	}
	return googledrive.CreateFileRequest{
		Name:     d.Name,
		MimeType: d.MimeType,
		Content:  content,
		FolderID: d.FolderID,
	}, nil
}

type calendarWriteInput struct {
	CalendarID          string                            `json:"calendarId"`
	EventID             string                            `json:"eventId"`
	Summary             string                            `json:"summary"`
	Description         string                            `json:"description"`
	Location            string                            `json:"location"`
	StartTime           string                            `json:"startTime"`
	EndTime             string                            `json:"endTime"`
	StartDate           string                            `json:"startDate"`
	EndDate             string                            `json:"endDate"`
	AllDay              bool                              `json:"allDay"`
	TimeZone            string                            `json:"timeZone"`
	Attendees           []string                          `json:"attendees"`
	Recurrence          []string                          `json:"recurrence"`
	EventType           string                            `json:"eventType"`
	UseDefaultReminders *bool                             `json:"useDefaultReminders"`
	ReminderOverrides   []googlecalendar.ReminderOverride `json:"reminderOverrides"`
	AddGoogleMeet       bool                              `json:"addGoogleMeet"`
	SendUpdates         string                            `json:"sendUpdates"`
}

func (c calendarWriteInput) toCreateRequest() (googlecalendar.CreateEventRequest, error) {
	start, end, err := c.parseTimes()
	if err != nil {
		return googlecalendar.CreateEventRequest{}, err
	}
	return googlecalendar.CreateEventRequest{
		Summary:             c.Summary,
		Description:         c.Description,
		Location:            c.Location,
		StartTime:           start,
		EndTime:             end,
		StartDate:           c.StartDate,
		EndDate:             c.EndDate,
		AllDay:              c.AllDay,
		TimeZone:            c.TimeZone,
		Attendees:           c.Attendees,
		Recurrence:          c.Recurrence,
		EventType:           c.EventType,
		UseDefaultReminders: c.UseDefaultReminders,
		ReminderOverrides:   c.ReminderOverrides,
		AddGoogleMeet:       c.AddGoogleMeet,
		SendUpdates:         c.SendUpdates,
	}, nil
}

func (c calendarWriteInput) toUpdateRequest() (googlecalendar.UpdateEventRequest, error) {
	start, end, err := c.parseTimes()
	if err != nil {
		return googlecalendar.UpdateEventRequest{}, err
	}
	return googlecalendar.UpdateEventRequest{
		Summary:             c.Summary,
		Description:         c.Description,
		Location:            c.Location,
		StartTime:           start,
		EndTime:             end,
		StartDate:           c.StartDate,
		EndDate:             c.EndDate,
		AllDay:              c.AllDay,
		TimeZone:            c.TimeZone,
		Attendees:           c.Attendees,
		Recurrence:          c.Recurrence,
		EventType:           c.EventType,
		UseDefaultReminders: c.UseDefaultReminders,
		ReminderOverrides:   c.ReminderOverrides,
		AddGoogleMeet:       c.AddGoogleMeet,
		SendUpdates:         c.SendUpdates,
	}, nil
}

func (c calendarWriteInput) parseTimes() (time.Time, time.Time, error) {
	if c.AllDay {
		return time.Time{}, time.Time{}, nil
	}
	start, err := parseRequiredTime(c.StartTime, "startTime")
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	end, err := parseRequiredTime(c.EndTime, "endTime")
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	return start, end, nil
}

func decodeInput(raw json.RawMessage, dest any) error {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	if err := json.Unmarshal(raw, dest); err != nil {
		return fmt.Errorf("decode input: %w", err)
	}
	return nil
}

func decodeAttachments(inputs []outboundAttachmentInput) ([]gmail.OutboundAttachment, error) {
	attachments := make([]gmail.OutboundAttachment, 0, len(inputs))
	for _, input := range inputs {
		data, err := decodeBase64(input.ContentBase64)
		if err != nil {
			return nil, fmt.Errorf("decode attachment %q: %w", input.Filename, err)
		}
		attachments = append(attachments, gmail.OutboundAttachment{
			Filename: input.Filename,
			MimeType: input.MimeType,
			Data:     data,
		})
	}
	return attachments, nil
}

func decodeBase64(value string) ([]byte, error) {
	cleaned := strings.NewReplacer("\n", "", "\r", "", "\t", "", " ", "").Replace(strings.TrimSpace(value))
	if cleaned == "" {
		return nil, fmt.Errorf("contentBase64 is required")
	}
	data, err := base64.StdEncoding.DecodeString(cleaned)
	if err == nil {
		return data, nil
	}
	data, rawErr := base64.RawStdEncoding.DecodeString(cleaned)
	if rawErr == nil {
		return data, nil
	}
	return nil, err
}

func parseOptionalTime(value string) time.Time {
	parsed, _ := parseTime(value)
	return parsed
}

func parseRequiredTime(value, field string) (time.Time, error) {
	parsed, err := parseTime(value)
	if err != nil {
		return time.Time{}, fmt.Errorf("%s must be RFC3339", field)
	}
	if parsed.IsZero() {
		return time.Time{}, fmt.Errorf("%s is required", field)
	}
	return parsed, nil
}

func parseTime(value string) (time.Time, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return time.Time{}, nil
	}
	parsed, err := time.Parse(time.RFC3339, trimmed)
	if err != nil {
		return time.Time{}, err
	}
	return parsed, nil
}

func successResponse(id string, result any) sidecarResponse {
	return sidecarResponse{ID: id, OK: true, Result: result}
}

func errorResponse(id string, err sidecarError) sidecarResponse {
	if err.Code == "" {
		err.Code = "sidecar_internal"
	}
	return sidecarResponse{ID: id, OK: false, Error: &err}
}

func normalizeError(err error) sidecarError {
	var already sidecarError
	if errors.As(err, &already) {
		return already
	}
	message := err.Error()
	status := googleStatus(message)
	code := "sidecar_internal"
	retryable := false
	switch status {
	case http.StatusUnauthorized:
		code = "google_unauthorized"
	case http.StatusForbidden:
		code = "google_forbidden"
	case http.StatusNotFound:
		code = "google_not_found"
	case http.StatusTooManyRequests:
		code = "google_rate_limited"
		retryable = true
	case http.StatusBadRequest:
		code = "google_bad_request"
	case http.StatusInternalServerError, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		code = "google_transient"
		retryable = true
	default:
		if strings.Contains(strings.ToLower(message), "context deadline exceeded") {
			code = "google_transient"
			retryable = true
		} else if strings.Contains(strings.ToLower(message), "required") || strings.Contains(strings.ToLower(message), "decode input") {
			code = "invalid_request"
		}
	}
	return sidecarError{Code: code, Message: redactErrorMessage(message), GoogleStatus: status, Retryable: retryable}
}

func googleStatus(message string) int {
	for _, marker := range []string{"status ", "returned "} {
		idx := strings.Index(message, marker)
		if idx < 0 {
			continue
		}
		tail := message[idx+len(marker):]
		fields := strings.FieldsFunc(tail, func(r rune) bool { return r < '0' || r > '9' })
		if len(fields) == 0 {
			continue
		}
		status, err := strconv.Atoi(fields[0])
		if err == nil && status >= 100 && status <= 599 {
			return status
		}
	}
	return 0
}

func redactErrorMessage(message string) string {
	if strings.Contains(strings.ToLower(message), "authorization: bearer") {
		return "google api request failed"
	}
	return message
}

func supportedMethods() []string {
	return []string{
		"sidecar.version",
		"gmail.search",
		"gmail.readThread",
		"gmail.readAttachment",
		"gmail.listLabels",
		"gmail.createDraft",
		"gmail.updateDraft",
		"gmail.deleteDraft",
		"gmail.sendDraft",
		"calendar.listCalendars",
		"calendar.listEvents",
		"calendar.readEvent",
		"calendar.freeBusy",
		"calendar.createEvent",
		"calendar.updateEvent",
		"calendar.deleteEvent",
		"drive.search",
		"drive.readFile",
		"drive.listSharedDrives",
		"drive.createFile",
		"drive.createFolder",
		"drive.updateFile",
		"drive.copyFile",
		"drive.trashFile",
		"drive.listPermissions",
		"drive.createPermission",
		"drive.updatePermission",
		"drive.deletePermission",
	}
}
