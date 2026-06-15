package googlecalendar

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/ambient-xyz/AmbientDesktop/sidecars/google/internal/gmail"
)

const apiURL = "https://www.googleapis.com/calendar/v3"

type Service struct {
	httpClient *http.Client
}

type Calendar struct {
	ID          string `json:"id"`
	Summary     string `json:"summary"`
	Description string `json:"description,omitempty"`
	Primary     bool   `json:"primary,omitempty"`
	TimeZone    string `json:"timeZone,omitempty"`
}

type Event struct {
	ID                  string             `json:"id"`
	Status              string             `json:"status,omitempty"`
	Summary             string             `json:"summary,omitempty"`
	Description         string             `json:"description,omitempty"`
	Location            string             `json:"location,omitempty"`
	HTMLLink            string             `json:"htmlLink,omitempty"`
	HangoutLink         string             `json:"hangoutLink,omitempty"`
	ConferenceLink      string             `json:"conferenceLink,omitempty"`
	EventType           string             `json:"eventType,omitempty"`
	TimeZone            string             `json:"timeZone,omitempty"`
	AllDay              bool               `json:"allDay,omitempty"`
	StartTime           time.Time          `json:"startTime,omitempty"`
	EndTime             time.Time          `json:"endTime,omitempty"`
	StartDate           string             `json:"startDate,omitempty"`
	EndDate             string             `json:"endDate,omitempty"`
	Attendees           []EventAttendee    `json:"attendees,omitempty"`
	Recurrence          []string           `json:"recurrence,omitempty"`
	UseDefaultReminders *bool              `json:"useDefaultReminders,omitempty"`
	ReminderOverrides   []ReminderOverride `json:"reminderOverrides,omitempty"`
}

type BusySlot struct {
	StartTime time.Time `json:"startTime"`
	EndTime   time.Time `json:"endTime"`
}

type EventAttendee struct {
	Email          string `json:"email"`
	DisplayName    string `json:"displayName,omitempty"`
	ResponseStatus string `json:"responseStatus,omitempty"`
	Optional       bool   `json:"optional,omitempty"`
}

type ReminderOverride struct {
	Method  string `json:"method"`
	Minutes int    `json:"minutes"`
}

type CreateEventRequest struct {
	Summary             string             `json:"summary"`
	Description         string             `json:"description,omitempty"`
	Location            string             `json:"location,omitempty"`
	StartTime           time.Time          `json:"startTime"`
	EndTime             time.Time          `json:"endTime"`
	StartDate           string             `json:"startDate,omitempty"`
	EndDate             string             `json:"endDate,omitempty"`
	AllDay              bool               `json:"allDay,omitempty"`
	TimeZone            string             `json:"timeZone,omitempty"`
	Attendees           []string           `json:"attendees,omitempty"`
	Recurrence          []string           `json:"recurrence,omitempty"`
	EventType           string             `json:"eventType,omitempty"`
	UseDefaultReminders *bool              `json:"useDefaultReminders,omitempty"`
	ReminderOverrides   []ReminderOverride `json:"reminderOverrides,omitempty"`
	AddGoogleMeet       bool               `json:"addGoogleMeet,omitempty"`
	SendUpdates         string             `json:"sendUpdates,omitempty"`
}

type UpdateEventRequest struct {
	Summary             string             `json:"summary"`
	Description         string             `json:"description,omitempty"`
	Location            string             `json:"location,omitempty"`
	StartTime           time.Time          `json:"startTime"`
	EndTime             time.Time          `json:"endTime"`
	StartDate           string             `json:"startDate,omitempty"`
	EndDate             string             `json:"endDate,omitempty"`
	AllDay              bool               `json:"allDay,omitempty"`
	TimeZone            string             `json:"timeZone,omitempty"`
	Attendees           []string           `json:"attendees,omitempty"`
	Recurrence          []string           `json:"recurrence,omitempty"`
	EventType           string             `json:"eventType,omitempty"`
	UseDefaultReminders *bool              `json:"useDefaultReminders,omitempty"`
	ReminderOverrides   []ReminderOverride `json:"reminderOverrides,omitempty"`
	AddGoogleMeet       bool               `json:"addGoogleMeet,omitempty"`
	SendUpdates         string             `json:"sendUpdates,omitempty"`
}

func New() *Service {
	return &Service{httpClient: &http.Client{Timeout: 20 * time.Second}}
}

func (s *Service) ListCalendars(ctx context.Context, token gmail.TokenEnvelope) ([]Calendar, error) {
	var payload struct {
		Items []struct {
			ID          string `json:"id"`
			Summary     string `json:"summary"`
			Description string `json:"description"`
			Primary     bool   `json:"primary"`
			TimeZone    string `json:"timeZone"`
		} `json:"items"`
	}
	if err := s.doJSON(ctx, token, http.MethodGet, apiURL+"/users/me/calendarList", nil, &payload); err != nil {
		return nil, err
	}
	calendars := make([]Calendar, 0, len(payload.Items))
	for _, item := range payload.Items {
		calendars = append(calendars, Calendar{
			ID:          item.ID,
			Summary:     item.Summary,
			Description: item.Description,
			Primary:     item.Primary,
			TimeZone:    item.TimeZone,
		})
	}
	return calendars, nil
}

func (s *Service) ListEvents(ctx context.Context, token gmail.TokenEnvelope, calendarID string, timeMin, timeMax time.Time, maxResults int) ([]Event, error) {
	if strings.TrimSpace(calendarID) == "" {
		calendarID = "primary"
	}
	if maxResults <= 0 || maxResults > 50 {
		maxResults = 10
	}
	endpoint, err := url.Parse(apiURL + "/calendars/" + url.PathEscape(calendarID) + "/events")
	if err != nil {
		return nil, err
	}
	values := endpoint.Query()
	values.Set("singleEvents", "true")
	values.Set("orderBy", "startTime")
	values.Set("maxResults", strconv.Itoa(maxResults))
	if !timeMin.IsZero() {
		values.Set("timeMin", timeMin.UTC().Format(time.RFC3339))
	}
	if !timeMax.IsZero() {
		values.Set("timeMax", timeMax.UTC().Format(time.RFC3339))
	}
	endpoint.RawQuery = values.Encode()

	var payload struct {
		Items []calendarEventResponse `json:"items"`
	}
	if err := s.doJSON(ctx, token, http.MethodGet, endpoint.String(), nil, &payload); err != nil {
		return nil, err
	}
	events := make([]Event, 0, len(payload.Items))
	for _, item := range payload.Items {
		events = append(events, decodeCalendarEvent(item))
	}
	return events, nil
}

func (s *Service) GetEvent(ctx context.Context, token gmail.TokenEnvelope, calendarID, eventID string) (Event, error) {
	if strings.TrimSpace(calendarID) == "" {
		calendarID = "primary"
	}
	if strings.TrimSpace(eventID) == "" {
		return Event{}, fmt.Errorf("event id is required")
	}
	payload, err := s.getEventResponse(ctx, token, calendarID, eventID)
	if err != nil {
		parentEventID := recurringParentEventID(eventID)
		if parentEventID == "" || !strings.Contains(err.Error(), "Not Found") {
			return Event{}, err
		}
		payload, err = s.getEventResponse(ctx, token, calendarID, parentEventID)
		if err != nil {
			return Event{}, err
		}
	}
	return decodeCalendarEvent(payload), nil
}

func (s *Service) getEventResponse(ctx context.Context, token gmail.TokenEnvelope, calendarID, eventID string) (calendarEventResponse, error) {
	var payload calendarEventResponse
	if err := s.doJSON(ctx, token, http.MethodGet, apiURL+"/calendars/"+url.PathEscape(calendarID)+"/events/"+url.PathEscape(eventID), nil, &payload); err != nil {
		return calendarEventResponse{}, err
	}
	return payload, nil
}

func recurringParentEventID(eventID string) string {
	trimmed := strings.TrimSpace(eventID)
	idx := strings.LastIndex(trimmed, "_")
	if idx <= 0 || idx+9 > len(trimmed) {
		return ""
	}
	suffix := trimmed[idx+1:]
	if len(suffix) < 8 {
		return ""
	}
	for _, ch := range suffix[:8] {
		if ch < '0' || ch > '9' {
			return ""
		}
	}
	return trimmed[:idx]
}

func (s *Service) CreateEvent(ctx context.Context, token gmail.TokenEnvelope, calendarID string, req CreateEventRequest) (Event, error) {
	if strings.TrimSpace(calendarID) == "" {
		calendarID = "primary"
	}
	endpoint, err := calendarWriteEndpoint(calendarID, "", req.SendUpdates, req.AddGoogleMeet)
	if err != nil {
		return Event{}, err
	}
	payload, err := eventPayload(calendarEventWriteRequest{
		Summary:             req.Summary,
		Description:         req.Description,
		Location:            req.Location,
		StartTime:           req.StartTime,
		EndTime:             req.EndTime,
		StartDate:           req.StartDate,
		EndDate:             req.EndDate,
		AllDay:              req.AllDay,
		TimeZone:            req.TimeZone,
		Attendees:           req.Attendees,
		Recurrence:          req.Recurrence,
		EventType:           req.EventType,
		UseDefaultReminders: req.UseDefaultReminders,
		ReminderOverrides:   req.ReminderOverrides,
		AddGoogleMeet:       req.AddGoogleMeet,
	})
	if err != nil {
		return Event{}, err
	}
	var created calendarEventResponse
	if err := s.doJSON(ctx, token, http.MethodPost, endpoint, payload, &created); err != nil {
		return Event{}, err
	}
	return decodeCalendarEvent(created), nil
}

func (s *Service) UpdateEvent(ctx context.Context, token gmail.TokenEnvelope, calendarID, eventID string, req UpdateEventRequest) (Event, error) {
	if strings.TrimSpace(calendarID) == "" {
		calendarID = "primary"
	}
	if strings.TrimSpace(eventID) == "" {
		return Event{}, fmt.Errorf("event id is required")
	}
	endpoint, err := calendarWriteEndpoint(calendarID, eventID, req.SendUpdates, req.AddGoogleMeet)
	if err != nil {
		return Event{}, err
	}
	payload, err := eventPayload(calendarEventWriteRequest{
		Summary:             req.Summary,
		Description:         req.Description,
		Location:            req.Location,
		StartTime:           req.StartTime,
		EndTime:             req.EndTime,
		StartDate:           req.StartDate,
		EndDate:             req.EndDate,
		AllDay:              req.AllDay,
		TimeZone:            req.TimeZone,
		Attendees:           req.Attendees,
		Recurrence:          req.Recurrence,
		EventType:           req.EventType,
		UseDefaultReminders: req.UseDefaultReminders,
		ReminderOverrides:   req.ReminderOverrides,
		AddGoogleMeet:       req.AddGoogleMeet,
	})
	if err != nil {
		return Event{}, err
	}
	var updated calendarEventResponse
	if err := s.doJSON(ctx, token, http.MethodPatch, endpoint, payload, &updated); err != nil {
		return Event{}, err
	}
	return decodeCalendarEvent(updated), nil
}

func (s *Service) DeleteEvent(ctx context.Context, token gmail.TokenEnvelope, calendarID, eventID string) error {
	if strings.TrimSpace(calendarID) == "" {
		calendarID = "primary"
	}
	if strings.TrimSpace(eventID) == "" {
		return fmt.Errorf("event id is required")
	}
	return s.doJSON(ctx, token, http.MethodDelete, apiURL+"/calendars/"+url.PathEscape(calendarID)+"/events/"+url.PathEscape(eventID), nil, nil)
}

func (s *Service) FreeBusy(ctx context.Context, token gmail.TokenEnvelope, calendarIDs []string, timeMin, timeMax time.Time) (map[string][]BusySlot, error) {
	if len(calendarIDs) == 0 {
		calendarIDs = []string{"primary"}
	}
	payload := map[string]any{
		"timeMin": timeMin.UTC().Format(time.RFC3339),
		"timeMax": timeMax.UTC().Format(time.RFC3339),
		"items":   make([]map[string]string, 0, len(calendarIDs)),
	}
	for _, calendarID := range calendarIDs {
		if trimmed := strings.TrimSpace(calendarID); trimmed != "" {
			payload["items"] = append(payload["items"].([]map[string]string), map[string]string{"id": trimmed})
		}
	}
	var response struct {
		Calendars map[string]struct {
			Busy []struct {
				Start string `json:"start"`
				End   string `json:"end"`
			} `json:"busy"`
		} `json:"calendars"`
	}
	if err := s.doJSON(ctx, token, http.MethodPost, apiURL+"/freeBusy", payload, &response); err != nil {
		return nil, err
	}
	result := make(map[string][]BusySlot, len(response.Calendars))
	for calendarID, calendar := range response.Calendars {
		slots := make([]BusySlot, 0, len(calendar.Busy))
		for _, slot := range calendar.Busy {
			slots = append(slots, BusySlot{
				StartTime: parseCalendarTime(slot.Start, ""),
				EndTime:   parseCalendarTime(slot.End, ""),
			})
		}
		result[calendarID] = slots
	}
	return result, nil
}

type calendarEventDateTime struct {
	DateTime string `json:"dateTime"`
	Date     string `json:"date"`
	TimeZone string `json:"timeZone"`
}

type calendarEventResponse struct {
	ID          string                `json:"id"`
	Status      string                `json:"status"`
	Summary     string                `json:"summary"`
	Description string                `json:"description"`
	Location    string                `json:"location"`
	HTMLLink    string                `json:"htmlLink"`
	HangoutLink string                `json:"hangoutLink"`
	EventType   string                `json:"eventType"`
	Start       calendarEventDateTime `json:"start"`
	End         calendarEventDateTime `json:"end"`
	Attendees   []EventAttendee       `json:"attendees"`
	Recurrence  []string              `json:"recurrence"`
	Reminders   struct {
		UseDefault *bool              `json:"useDefault"`
		Overrides  []ReminderOverride `json:"overrides"`
	} `json:"reminders"`
	ConferenceData struct {
		EntryPoints []struct {
			EntryPointType string `json:"entryPointType"`
			URI            string `json:"uri"`
		} `json:"entryPoints"`
	} `json:"conferenceData"`
}

type calendarEventWriteRequest struct {
	Summary             string
	Description         string
	Location            string
	StartTime           time.Time
	EndTime             time.Time
	StartDate           string
	EndDate             string
	AllDay              bool
	TimeZone            string
	Attendees           []string
	Recurrence          []string
	EventType           string
	UseDefaultReminders *bool
	ReminderOverrides   []ReminderOverride
	AddGoogleMeet       bool
}

func eventPayload(req calendarEventWriteRequest) (map[string]any, error) {
	if strings.TrimSpace(req.Summary) == "" {
		return nil, fmt.Errorf("event summary is required")
	}
	payload := map[string]any{
		"summary":     strings.TrimSpace(req.Summary),
		"description": strings.TrimSpace(req.Description),
		"location":    strings.TrimSpace(req.Location),
	}
	if req.AllDay {
		startDate, err := normalizeCalendarDate(req.StartDate)
		if err != nil {
			return nil, fmt.Errorf("startDate must be YYYY-MM-DD")
		}
		endDate, err := normalizeCalendarDate(req.EndDate)
		if err != nil {
			return nil, fmt.Errorf("endDate must be YYYY-MM-DD")
		}
		if endDate < startDate {
			return nil, fmt.Errorf("endDate must be on or after startDate")
		}
		payload["start"] = map[string]any{"date": startDate}
		payload["end"] = map[string]any{"date": exclusiveAllDayEndDate(endDate)}
	} else {
		if req.StartTime.IsZero() || req.EndTime.IsZero() {
			return nil, fmt.Errorf("startTime and endTime are required")
		}
		if req.EndTime.Before(req.StartTime) || req.EndTime.Equal(req.StartTime) {
			return nil, fmt.Errorf("endTime must be after startTime")
		}
		payload["start"] = map[string]any{"dateTime": req.StartTime.Format(time.RFC3339)}
		payload["end"] = map[string]any{"dateTime": req.EndTime.Format(time.RFC3339)}
		if tz := strings.TrimSpace(req.TimeZone); tz != "" {
			payload["start"].(map[string]any)["timeZone"] = tz
			payload["end"].(map[string]any)["timeZone"] = tz
		}
	}
	if attendees := sanitizeAttendees(req.Attendees); len(attendees) > 0 {
		payload["attendees"] = attendees
	}
	if recurrence := sanitizeStringSlice(req.Recurrence); len(recurrence) > 0 {
		payload["recurrence"] = recurrence
	}
	if eventType := strings.TrimSpace(req.EventType); eventType != "" {
		payload["eventType"] = eventType
	}
	if reminders := reminderPayload(req.UseDefaultReminders, req.ReminderOverrides); reminders != nil {
		payload["reminders"] = reminders
	}
	if req.AddGoogleMeet {
		payload["conferenceData"] = map[string]any{
			"createRequest": map[string]any{
				"requestId": fmt.Sprintf("ambient-%d", time.Now().UnixNano()),
				"conferenceSolutionKey": map[string]any{
					"type": "hangoutsMeet",
				},
			},
		}
	}
	return payload, nil
}

func calendarWriteEndpoint(calendarID, eventID, sendUpdates string, addGoogleMeet bool) (string, error) {
	base := apiURL + "/calendars/" + url.PathEscape(firstNonEmpty(strings.TrimSpace(calendarID), "primary")) + "/events"
	if strings.TrimSpace(eventID) != "" {
		base += "/" + url.PathEscape(strings.TrimSpace(eventID))
	}
	values := url.Values{}
	if trimmed := strings.TrimSpace(sendUpdates); trimmed != "" {
		switch trimmed {
		case "all", "externalOnly", "none":
			values.Set("sendUpdates", trimmed)
		default:
			return "", fmt.Errorf("sendUpdates must be one of all, externalOnly, or none")
		}
	}
	if addGoogleMeet {
		values.Set("conferenceDataVersion", "1")
	}
	if encoded := values.Encode(); encoded != "" {
		base += "?" + encoded
	}
	return base, nil
}

func decodeCalendarEvent(payload calendarEventResponse) Event {
	event := Event{
		ID:                  payload.ID,
		Status:              payload.Status,
		Summary:             payload.Summary,
		Description:         payload.Description,
		Location:            payload.Location,
		HTMLLink:            payload.HTMLLink,
		HangoutLink:         payload.HangoutLink,
		ConferenceLink:      firstNonEmpty(conferenceEntryPoint(payload.ConferenceData.EntryPoints), payload.HangoutLink),
		EventType:           payload.EventType,
		TimeZone:            firstNonEmpty(payload.Start.TimeZone, payload.End.TimeZone),
		Attendees:           payload.Attendees,
		Recurrence:          sanitizeStringSlice(payload.Recurrence),
		UseDefaultReminders: payload.Reminders.UseDefault,
		ReminderOverrides:   normalizeReminderOverrides(payload.Reminders.Overrides),
	}
	if strings.TrimSpace(payload.Start.Date) != "" || strings.TrimSpace(payload.End.Date) != "" {
		event.AllDay = true
		event.StartDate = strings.TrimSpace(payload.Start.Date)
		event.EndDate = inclusiveAllDayEndDate(payload.End.Date)
		return event
	}
	event.StartTime = parseCalendarTime(payload.Start.DateTime, payload.Start.Date)
	event.EndTime = parseCalendarTime(payload.End.DateTime, payload.End.Date)
	return event
}

func conferenceEntryPoint(entryPoints []struct {
	EntryPointType string `json:"entryPointType"`
	URI            string `json:"uri"`
}) string {
	for _, entryPoint := range entryPoints {
		if strings.EqualFold(strings.TrimSpace(entryPoint.EntryPointType), "video") && strings.TrimSpace(entryPoint.URI) != "" {
			return strings.TrimSpace(entryPoint.URI)
		}
	}
	for _, entryPoint := range entryPoints {
		if strings.TrimSpace(entryPoint.URI) != "" {
			return strings.TrimSpace(entryPoint.URI)
		}
	}
	return ""
}

func sanitizeAttendees(values []string) []map[string]any {
	attendees := make([]map[string]any, 0, len(values))
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			attendees = append(attendees, map[string]any{"email": trimmed})
		}
	}
	return attendees
}

func sanitizeStringSlice(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func reminderPayload(useDefault *bool, overrides []ReminderOverride) map[string]any {
	normalized := normalizeReminderOverrides(overrides)
	if useDefault == nil && len(normalized) == 0 {
		return nil
	}
	reminders := map[string]any{}
	if len(normalized) > 0 {
		reminders["useDefault"] = false
		overridePayload := make([]map[string]any, 0, len(normalized))
		for _, override := range normalized {
			overridePayload = append(overridePayload, map[string]any{
				"method":  override.Method,
				"minutes": override.Minutes,
			})
		}
		reminders["overrides"] = overridePayload
		return reminders
	}
	if useDefault != nil {
		reminders["useDefault"] = *useDefault
	}
	return reminders
}

func normalizeReminderOverrides(overrides []ReminderOverride) []ReminderOverride {
	normalized := make([]ReminderOverride, 0, len(overrides))
	for _, override := range overrides {
		method := strings.TrimSpace(override.Method)
		if method == "" || override.Minutes <= 0 {
			continue
		}
		normalized = append(normalized, ReminderOverride{
			Method:  method,
			Minutes: override.Minutes,
		})
	}
	return normalized
}

func normalizeCalendarDate(value string) (string, error) {
	parsed, err := time.Parse("2006-01-02", strings.TrimSpace(value))
	if err != nil {
		return "", err
	}
	return parsed.Format("2006-01-02"), nil
}

func exclusiveAllDayEndDate(value string) string {
	parsed, err := time.Parse("2006-01-02", strings.TrimSpace(value))
	if err != nil {
		return ""
	}
	return parsed.AddDate(0, 0, 1).Format("2006-01-02")
}

func inclusiveAllDayEndDate(value string) string {
	parsed, err := time.Parse("2006-01-02", strings.TrimSpace(value))
	if err != nil {
		return ""
	}
	return parsed.AddDate(0, 0, -1).Format("2006-01-02")
}

func (s *Service) doJSON(ctx context.Context, token gmail.TokenEnvelope, method, endpoint string, body any, dest any) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", firstNonEmpty(token.TokenType, "Bearer")+" "+token.AccessToken)

	response, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode >= 400 {
		var apiErr struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = decodeResponse(response, &apiErr)
		return fmt.Errorf("google calendar api failed: %s", firstNonEmpty(apiErr.Error.Message, response.Status))
	}
	return decodeResponse(response, dest)
}

func decodeResponse(response *http.Response, dest any) error {
	raw, err := io.ReadAll(io.LimitReader(response.Body, 8<<20))
	if err != nil {
		return err
	}
	if len(raw) == 0 {
		return nil
	}
	return json.Unmarshal(raw, dest)
}

func parseCalendarTime(dateTime, date string) time.Time {
	if strings.TrimSpace(dateTime) != "" {
		if parsed, err := time.Parse(time.RFC3339, dateTime); err == nil {
			return parsed.UTC()
		}
	}
	if strings.TrimSpace(date) != "" {
		if parsed, err := time.Parse("2006-01-02", date); err == nil {
			return parsed.UTC()
		}
	}
	return time.Time{}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
