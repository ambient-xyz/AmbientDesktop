package gmail

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/mail"
	"net/textproto"
	"net/url"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/ambient-xyz/AmbientDesktop/sidecars/google/internal/secretbox"
)

const (
	ProviderName = "google-gmail"

	authURL  = "https://accounts.google.com/o/oauth2/v2/auth"
	tokenURL = "https://oauth2.googleapis.com/token"
	apiURL   = "https://gmail.googleapis.com/gmail/v1"
)

var DefaultScopes = []string{
	"https://www.googleapis.com/auth/gmail.readonly",
	"https://www.googleapis.com/auth/gmail.compose",
	"https://www.googleapis.com/auth/gmail.send",
	"https://www.googleapis.com/auth/gmail.labels",
	"https://www.googleapis.com/auth/gmail.modify",
	"https://www.googleapis.com/auth/gmail.settings.basic",
	"https://www.googleapis.com/auth/calendar.readonly",
	"https://www.googleapis.com/auth/calendar.events",
	"https://www.googleapis.com/auth/drive.readonly",
	"https://www.googleapis.com/auth/drive.file",
}

type Service struct {
	clientID     string
	clientSecret string
	redirectURL  string
	httpClient   *http.Client
	sealer       *secretbox.Sealer
}

type OAuthState struct {
	TenantID    string   `json:"tenantId"`
	ProjectID   string   `json:"projectId,omitempty"`
	Label       string   `json:"label,omitempty"`
	ReturnTo    string   `json:"returnTo,omitempty"`
	Scopes      []string `json:"scopes,omitempty"`
	RedirectURL string   `json:"redirectUrl,omitempty"`
}

type TokenEnvelope struct {
	AccessToken  string    `json:"accessToken"`
	RefreshToken string    `json:"refreshToken,omitempty"`
	TokenType    string    `json:"tokenType"`
	Scope        string    `json:"scope,omitempty"`
	Expiry       time.Time `json:"expiry"`
}

type Profile struct {
	EmailAddress  string `json:"emailAddress"`
	MessagesTotal int    `json:"messagesTotal"`
	ThreadsTotal  int    `json:"threadsTotal"`
	HistoryID     string `json:"historyId"`
}

type MessageSummary struct {
	ID         string    `json:"id"`
	ThreadID   string    `json:"threadId"`
	From       string    `json:"from,omitempty"`
	To         string    `json:"to,omitempty"`
	Subject    string    `json:"subject,omitempty"`
	Snippet    string    `json:"snippet,omitempty"`
	LabelIDs   []string  `json:"labelIds,omitempty"`
	ReceivedAt time.Time `json:"receivedAt,omitempty"`
}

type ThreadSummary struct {
	ID               string           `json:"id"`
	Subject          string           `json:"subject,omitempty"`
	From             string           `json:"from,omitempty"`
	Snippet          string           `json:"snippet,omitempty"`
	MessageCount     int              `json:"messageCount"`
	LatestReceivedAt time.Time        `json:"latestReceivedAt,omitempty"`
	OldestReceivedAt time.Time        `json:"oldestReceivedAt,omitempty"`
	Messages         []MessageSummary `json:"messages,omitempty"`
}

type Thread struct {
	ID        string          `json:"id"`
	HistoryID string          `json:"historyId"`
	Snippet   string          `json:"snippet,omitempty"`
	Messages  []ThreadMessage `json:"messages"`
}

type ThreadMessage struct {
	ID          string              `json:"id"`
	ThreadID    string              `json:"threadId"`
	From        string              `json:"from,omitempty"`
	To          string              `json:"to,omitempty"`
	Cc          string              `json:"cc,omitempty"`
	Bcc         string              `json:"bcc,omitempty"`
	Subject     string              `json:"subject,omitempty"`
	Snippet     string              `json:"snippet,omitempty"`
	Body        string              `json:"body,omitempty"`
	Attachments []AttachmentSummary `json:"attachments,omitempty"`
	LabelIDs    []string            `json:"labelIds,omitempty"`
	ReceivedAt  time.Time           `json:"receivedAt,omitempty"`
}

type AttachmentSummary struct {
	ID        string `json:"id"`
	MessageID string `json:"messageId"`
	Filename  string `json:"filename,omitempty"`
	MimeType  string `json:"mimeType,omitempty"`
	Size      int64  `json:"size,omitempty"`
	Inline    bool   `json:"inline,omitempty"`
	ContentID string `json:"contentId,omitempty"`
}

type AttachmentRequest struct {
	MessageID    string `json:"messageId"`
	AttachmentID string `json:"attachmentId"`
	Filename     string `json:"filename,omitempty"`
	MimeType     string `json:"mimeType,omitempty"`
	Size         int64  `json:"size,omitempty"`
	Inline       bool   `json:"inline,omitempty"`
	ContentID    string `json:"contentId,omitempty"`
}

type Attachment struct {
	ID          string `json:"id"`
	MessageID   string `json:"messageId"`
	Filename    string `json:"filename,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
	Size        int64  `json:"size,omitempty"`
	Inline      bool   `json:"inline,omitempty"`
	ContentID   string `json:"contentId,omitempty"`
	Previewable bool   `json:"previewable,omitempty"`
	Content     string `json:"content,omitempty"`
	Truncated   bool   `json:"truncated,omitempty"`
	Data        []byte `json:"-"`
}

type ListMessagesResult struct {
	Messages           []MessageSummary `json:"messages"`
	Threads            []ThreadSummary  `json:"threads,omitempty"`
	NextPageToken      string           `json:"nextPageToken,omitempty"`
	ResultSizeEstimate int              `json:"resultSizeEstimate"`
}

type ListMessagesOptions struct {
	Query           string
	PageSize        int
	PageToken       string
	LabelIDs        []string
	ExcludeLabelIDs []string
	UnlabeledOnly   bool
	GroupByThread   bool
	ThreadOrder     string
	MessageOrder    string
}

type GetThreadOptions struct {
	MessageOrder string
}

type SendRequest struct {
	To          []string
	Cc          []string
	Bcc         []string
	Subject     string
	Body        string
	Attachments []OutboundAttachment
}

type SendResult struct {
	ID       string   `json:"id"`
	ThreadID string   `json:"threadId"`
	LabelIDs []string `json:"labelIds,omitempty"`
}

type OutboundAttachment struct {
	Filename string `json:"filename"`
	MimeType string `json:"mimeType,omitempty"`
	Data     []byte `json:"-"`
}

type DraftRequest struct {
	To          []string
	Cc          []string
	Bcc         []string
	Subject     string
	Body        string
	ThreadID    string
	Attachments []OutboundAttachment
}

type DraftResult struct {
	ID        string `json:"id"`
	MessageID string `json:"messageId,omitempty"`
	ThreadID  string `json:"threadId,omitempty"`
}

type DraftSummary struct {
	ID          string              `json:"id"`
	MessageID   string              `json:"messageId,omitempty"`
	ThreadID    string              `json:"threadId,omitempty"`
	To          string              `json:"to,omitempty"`
	Cc          string              `json:"cc,omitempty"`
	Bcc         string              `json:"bcc,omitempty"`
	Subject     string              `json:"subject,omitempty"`
	Snippet     string              `json:"snippet,omitempty"`
	Attachments []AttachmentSummary `json:"attachments,omitempty"`
	ReceivedAt  time.Time           `json:"receivedAt,omitempty"`
}

type Draft struct {
	ID          string              `json:"id"`
	MessageID   string              `json:"messageId,omitempty"`
	ThreadID    string              `json:"threadId,omitempty"`
	To          string              `json:"to,omitempty"`
	Cc          string              `json:"cc,omitempty"`
	Bcc         string              `json:"bcc,omitempty"`
	Subject     string              `json:"subject,omitempty"`
	Snippet     string              `json:"snippet,omitempty"`
	Body        string              `json:"body,omitempty"`
	Attachments []AttachmentSummary `json:"attachments,omitempty"`
	ReceivedAt  time.Time           `json:"receivedAt,omitempty"`
}

type ListDraftsResult struct {
	Drafts             []DraftSummary `json:"drafts"`
	NextPageToken      string         `json:"nextPageToken,omitempty"`
	ResultSizeEstimate int            `json:"resultSizeEstimate,omitempty"`
}

type ListDraftsOptions struct {
	PageSize  int
	PageToken string
}

type MessageMutationResult struct {
	ID       string   `json:"id"`
	ThreadID string   `json:"threadId,omitempty"`
	LabelIDs []string `json:"labelIds,omitempty"`
}

type Label struct {
	ID                    string `json:"id"`
	Name                  string `json:"name"`
	Type                  string `json:"type,omitempty"`
	MessageListVisibility string `json:"messageListVisibility,omitempty"`
	LabelListVisibility   string `json:"labelListVisibility,omitempty"`
	MessagesTotal         int    `json:"messagesTotal,omitempty"`
	MessagesUnread        int    `json:"messagesUnread,omitempty"`
	ThreadsTotal          int    `json:"threadsTotal,omitempty"`
	ThreadsUnread         int    `json:"threadsUnread,omitempty"`
}

type CreateLabelRequest struct {
	Name                  string `json:"name"`
	MessageListVisibility string `json:"messageListVisibility,omitempty"`
	LabelListVisibility   string `json:"labelListVisibility,omitempty"`
}

type UpdateLabelRequest struct {
	Name                  string `json:"name,omitempty"`
	MessageListVisibility string `json:"messageListVisibility,omitempty"`
	LabelListVisibility   string `json:"labelListVisibility,omitempty"`
}

type ModifyMessageOperation struct {
	ID             string   `json:"id"`
	AddLabelIDs    []string `json:"addLabelIds,omitempty"`
	RemoveLabelIDs []string `json:"removeLabelIds,omitempty"`
	AddLabels      []string `json:"addLabels,omitempty"`
	RemoveLabels   []string `json:"removeLabels,omitempty"`
}

type ModifyMessagesRequest struct {
	IDs            []string                 `json:"ids"`
	AddLabelIDs    []string                 `json:"addLabelIds,omitempty"`
	RemoveLabelIDs []string                 `json:"removeLabelIds,omitempty"`
	AddLabels      []string                 `json:"addLabels,omitempty"`
	RemoveLabels   []string                 `json:"removeLabels,omitempty"`
	Operations     []ModifyMessageOperation `json:"operations,omitempty"`
}

type ModifyMessageOperationResult struct {
	ID             string   `json:"id"`
	AddLabelIDs    []string `json:"addLabelIds,omitempty"`
	RemoveLabelIDs []string `json:"removeLabelIds,omitempty"`
}

type ModifyMessagesResult struct {
	UpdatedCount   int                            `json:"updatedCount"`
	AddLabelIDs    []string                       `json:"addLabelIds,omitempty"`
	RemoveLabelIDs []string                       `json:"removeLabelIds,omitempty"`
	Operations     []ModifyMessageOperationResult `json:"operations,omitempty"`
}

type Filter struct {
	ID       string         `json:"id"`
	Criteria FilterCriteria `json:"criteria"`
	Action   FilterAction   `json:"action"`
}

type FilterCriteria struct {
	From           string `json:"from,omitempty"`
	To             string `json:"to,omitempty"`
	Subject        string `json:"subject,omitempty"`
	Query          string `json:"query,omitempty"`
	NegatedQuery   string `json:"negatedQuery,omitempty"`
	HasAttachment  bool   `json:"hasAttachment,omitempty"`
	ExcludeChats   bool   `json:"excludeChats,omitempty"`
	Size           int64  `json:"size,omitempty"`
	SizeComparison string `json:"sizeComparison,omitempty"`
}

type FilterAction struct {
	AddLabelIDs    []string `json:"addLabelIds,omitempty"`
	RemoveLabelIDs []string `json:"removeLabelIds,omitempty"`
	Forward        string   `json:"forward,omitempty"`
}

type CreateFilterRequest struct {
	Criteria FilterCriteria `json:"criteria"`
	Action   FilterAction   `json:"action"`
}

func New(clientID, clientSecret, redirectURL string, sealer *secretbox.Sealer) *Service {
	return &Service{
		clientID:     strings.TrimSpace(clientID),
		clientSecret: strings.TrimSpace(clientSecret),
		redirectURL:  strings.TrimSpace(redirectURL),
		httpClient:   &http.Client{Timeout: 20 * time.Second},
		sealer:       sealer,
	}
}

func (s *Service) Ready() bool {
	return s.clientID != "" && s.clientSecret != "" && s.redirectURL != "" && s.sealer != nil
}

func (s *Service) AuthURL(state OAuthState) (string, error) {
	if !s.Ready() {
		return "", fmt.Errorf("gmail oauth is not configured")
	}
	if len(state.Scopes) == 0 {
		state.Scopes = DefaultScopes
	}
	redirectURL := s.resolveRedirectURL(state.RedirectURL)
	state.RedirectURL = redirectURL
	sealed, err := s.sealState(state)
	if err != nil {
		return "", err
	}
	query := url.Values{}
	query.Set("client_id", s.clientID)
	query.Set("redirect_uri", redirectURL)
	query.Set("response_type", "code")
	query.Set("access_type", "offline")
	query.Set("include_granted_scopes", "true")
	query.Set("prompt", "consent")
	query.Set("scope", strings.Join(state.Scopes, " "))
	query.Set("state", sealed)
	return authURL + "?" + query.Encode(), nil
}

func (s *Service) ParseState(value string) (OAuthState, error) {
	var state OAuthState
	if !s.Ready() {
		return state, fmt.Errorf("gmail oauth is not configured")
	}
	raw, err := s.sealer.Decrypt(value)
	if err != nil {
		return state, fmt.Errorf("decrypt oauth state: %w", err)
	}
	if err := json.Unmarshal(raw, &state); err != nil {
		return state, fmt.Errorf("decode oauth state: %w", err)
	}
	if len(state.Scopes) == 0 {
		state.Scopes = DefaultScopes
	}
	return state, nil
}

func (s *Service) ExchangeCode(ctx context.Context, code string, redirectURL string) (TokenEnvelope, error) {
	values := url.Values{}
	values.Set("code", strings.TrimSpace(code))
	values.Set("client_id", s.clientID)
	values.Set("client_secret", s.clientSecret)
	values.Set("redirect_uri", s.resolveRedirectURL(redirectURL))
	values.Set("grant_type", "authorization_code")
	return s.exchangeToken(ctx, values)
}

func (s *Service) resolveRedirectURL(override string) string {
	if trimmed := strings.TrimSpace(override); trimmed != "" {
		return trimmed
	}
	return s.redirectURL
}

func (s *Service) RefreshToken(ctx context.Context, refreshToken string) (TokenEnvelope, error) {
	values := url.Values{}
	values.Set("refresh_token", strings.TrimSpace(refreshToken))
	values.Set("client_id", s.clientID)
	values.Set("client_secret", s.clientSecret)
	values.Set("grant_type", "refresh_token")
	return s.exchangeToken(ctx, values)
}

func (s *Service) EnsureFreshToken(ctx context.Context, token TokenEnvelope) (TokenEnvelope, bool, error) {
	if token.AccessToken != "" && (token.Expiry.IsZero() || token.Expiry.After(time.Now().Add(45*time.Second))) {
		return token, false, nil
	}
	if strings.TrimSpace(token.RefreshToken) == "" {
		return token, false, fmt.Errorf("gmail token is expired and no refresh token is available")
	}
	refreshed, err := s.RefreshToken(ctx, token.RefreshToken)
	if err != nil {
		return token, false, err
	}
	if refreshed.RefreshToken == "" {
		refreshed.RefreshToken = token.RefreshToken
	}
	return refreshed, true, nil
}

func (s *Service) GetProfile(ctx context.Context, token TokenEnvelope) (Profile, error) {
	var profile Profile
	if err := s.doJSON(ctx, token, http.MethodGet, apiURL+"/users/me/profile", nil, &profile); err != nil {
		return profile, err
	}
	return profile, nil
}

func (s *Service) ListMessages(ctx context.Context, token TokenEnvelope, opts ListMessagesOptions) (ListMessagesResult, error) {
	type listResponse struct {
		Messages []struct {
			ID       string `json:"id"`
			ThreadID string `json:"threadId"`
		} `json:"messages"`
		NextPageToken      string `json:"nextPageToken"`
		ResultSizeEstimate int    `json:"resultSizeEstimate"`
	}

	pageSize := opts.PageSize
	if pageSize <= 0 || pageSize > 25 {
		pageSize = 10
	}
	endpoint, err := url.Parse(apiURL + "/users/me/messages")
	if err != nil {
		return ListMessagesResult{}, err
	}
	values := endpoint.Query()
	values.Set("maxResults", strconv.Itoa(pageSize))
	if strings.TrimSpace(opts.PageToken) != "" {
		values.Set("pageToken", opts.PageToken)
	}
	for _, labelID := range opts.LabelIDs {
		if trimmed := strings.TrimSpace(labelID); trimmed != "" {
			values.Add("labelIds", trimmed)
		}
	}
	queryParts := []string{}
	if trimmed := strings.TrimSpace(opts.Query); trimmed != "" {
		queryParts = append(queryParts, trimmed)
	}
	if opts.UnlabeledOnly {
		queryParts = append(queryParts, "-has:userlabels")
	}
	for _, labelID := range opts.ExcludeLabelIDs {
		if trimmed := strings.TrimSpace(labelID); trimmed != "" {
			queryParts = append(queryParts, "-label:"+trimmed)
		}
	}
	if len(queryParts) > 0 {
		values.Set("q", strings.Join(queryParts, " "))
	}
	endpoint.RawQuery = values.Encode()

	var list listResponse
	if err := s.doJSON(ctx, token, http.MethodGet, endpoint.String(), nil, &list); err != nil {
		return ListMessagesResult{}, err
	}

	result := ListMessagesResult{
		NextPageToken:      list.NextPageToken,
		ResultSizeEstimate: list.ResultSizeEstimate,
	}
	for _, message := range list.Messages {
		summary, err := s.GetMessageSummary(ctx, token, message.ID)
		if err != nil {
			return ListMessagesResult{}, err
		}
		result.Messages = append(result.Messages, summary)
	}
	result.Messages = sortMessageSummaries(result.Messages, opts.MessageOrder)
	if opts.GroupByThread {
		result.Threads = buildThreadSummaries(result.Messages, opts.ThreadOrder, opts.MessageOrder)
		result.Messages = flattenThreadSummaries(result.Threads)
	}
	return result, nil
}

func (s *Service) GetMessageSummary(ctx context.Context, token TokenEnvelope, messageID string) (MessageSummary, error) {
	endpoint, err := url.Parse(apiURL + "/users/me/messages/" + url.PathEscape(messageID))
	if err != nil {
		return MessageSummary{}, err
	}
	values := endpoint.Query()
	values.Set("format", "metadata")
	for _, header := range []string{"From", "To", "Subject", "Date"} {
		values.Add("metadataHeaders", header)
	}
	endpoint.RawQuery = values.Encode()

	var payload struct {
		ID           string   `json:"id"`
		ThreadID     string   `json:"threadId"`
		LabelIDs     []string `json:"labelIds"`
		Snippet      string   `json:"snippet"`
		InternalDate string   `json:"internalDate"`
		Payload      struct {
			Headers []struct {
				Name  string `json:"name"`
				Value string `json:"value"`
			} `json:"headers"`
		} `json:"payload"`
	}
	if err := s.doJSON(ctx, token, http.MethodGet, endpoint.String(), nil, &payload); err != nil {
		return MessageSummary{}, err
	}
	headers := headersToMap(payload.Payload.Headers)
	return MessageSummary{
		ID:         payload.ID,
		ThreadID:   payload.ThreadID,
		From:       headers["from"],
		To:         headers["to"],
		Subject:    headers["subject"],
		Snippet:    payload.Snippet,
		LabelIDs:   payload.LabelIDs,
		ReceivedAt: parseMessageTime(headers["date"], payload.InternalDate),
	}, nil
}

func (s *Service) GetThread(ctx context.Context, token TokenEnvelope, threadID string, opts GetThreadOptions) (Thread, error) {
	var payload struct {
		ID        string `json:"id"`
		HistoryID string `json:"historyId"`
		Snippet   string `json:"snippet"`
		Messages  []struct {
			ID           string      `json:"id"`
			ThreadID     string      `json:"threadId"`
			LabelIDs     []string    `json:"labelIds"`
			Snippet      string      `json:"snippet"`
			InternalDate string      `json:"internalDate"`
			Payload      messagePart `json:"payload"`
		} `json:"messages"`
	}
	endpoint := apiURL + "/users/me/threads/" + url.PathEscape(threadID) + "?format=full"
	if err := s.doJSON(ctx, token, http.MethodGet, endpoint, nil, &payload); err != nil {
		if !gmailNotFoundError(err) {
			return Thread{}, err
		}
		message, msgErr := s.GetMessageSummary(ctx, token, threadID)
		if msgErr != nil || strings.TrimSpace(message.ThreadID) == "" || strings.EqualFold(strings.TrimSpace(message.ThreadID), strings.TrimSpace(threadID)) {
			return Thread{}, err
		}
		if err := s.doJSON(ctx, token, http.MethodGet, apiURL+"/users/me/threads/"+url.PathEscape(message.ThreadID)+"?format=full", nil, &payload); err != nil {
			return Thread{}, err
		}
	}
	thread := Thread{
		ID:        payload.ID,
		HistoryID: payload.HistoryID,
		Snippet:   payload.Snippet,
	}
	for _, message := range payload.Messages {
		headers := headersToMap(message.Payload.Headers)
		thread.Messages = append(thread.Messages, ThreadMessage{
			ID:          message.ID,
			ThreadID:    message.ThreadID,
			From:        headers["from"],
			To:          headers["to"],
			Cc:          headers["cc"],
			Bcc:         headers["bcc"],
			Subject:     headers["subject"],
			Snippet:     message.Snippet,
			Body:        decodeBody(message.Payload),
			Attachments: collectMessageAttachments(message.Payload, message.ID),
			LabelIDs:    message.LabelIDs,
			ReceivedAt:  parseMessageTime(headers["date"], message.InternalDate),
		})
	}
	thread.Messages = sortThreadMessages(thread.Messages, opts.MessageOrder)
	return thread, nil
}

func (s *Service) GetAttachment(ctx context.Context, token TokenEnvelope, req AttachmentRequest) (Attachment, error) {
	req.MessageID = strings.TrimSpace(req.MessageID)
	req.AttachmentID = strings.TrimSpace(req.AttachmentID)
	if req.MessageID == "" {
		return Attachment{}, fmt.Errorf("message id is required")
	}
	if req.AttachmentID == "" {
		return Attachment{}, fmt.Errorf("attachment id is required")
	}

	summary := AttachmentSummary{
		ID:        req.AttachmentID,
		MessageID: req.MessageID,
		Filename:  strings.TrimSpace(req.Filename),
		MimeType:  strings.TrimSpace(req.MimeType),
		Size:      req.Size,
		Inline:    req.Inline,
		ContentID: strings.TrimSpace(req.ContentID),
	}
	part, partSummary, err := s.getAttachmentPart(ctx, token, req.MessageID, req.AttachmentID)
	if err == nil {
		summary = mergeAttachmentSummary(summary, partSummary)
	} else if strings.HasPrefix(req.AttachmentID, "inline:") {
		return Attachment{}, err
	}
	data, err := s.readAttachmentData(ctx, token, req.MessageID, req.AttachmentID, part)
	if err != nil {
		return Attachment{}, err
	}
	if summary.Size == 0 {
		summary.Size = int64(len(data))
	}
	content, previewable, truncated := previewAttachmentContent(data, summary.MimeType, summary.Filename)
	return Attachment{
		ID:          summary.ID,
		MessageID:   summary.MessageID,
		Filename:    summary.Filename,
		MimeType:    summary.MimeType,
		Size:        summary.Size,
		Inline:      summary.Inline,
		ContentID:   summary.ContentID,
		Previewable: previewable,
		Content:     content,
		Truncated:   truncated,
		Data:        append([]byte(nil), data...),
	}, nil
}

func gmailNotFoundError(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(strings.ToLower(strings.TrimSpace(err.Error())), "requested entity was not found")
}

func IsNotFoundError(err error) bool {
	return gmailNotFoundError(err)
}

func (s *Service) ListLabels(ctx context.Context, token TokenEnvelope) ([]Label, error) {
	var payload struct {
		Labels []Label `json:"labels"`
	}
	if err := s.doJSON(ctx, token, http.MethodGet, apiURL+"/users/me/labels", nil, &payload); err != nil {
		return nil, err
	}
	sort.SliceStable(payload.Labels, func(i, j int) bool {
		return strings.ToLower(payload.Labels[i].Name) < strings.ToLower(payload.Labels[j].Name)
	})
	return payload.Labels, nil
}

func (s *Service) CreateLabel(ctx context.Context, token TokenEnvelope, req CreateLabelRequest) (Label, error) {
	var label Label
	if strings.TrimSpace(req.Name) == "" {
		return label, fmt.Errorf("label name is required")
	}
	if err := s.doJSON(ctx, token, http.MethodPost, apiURL+"/users/me/labels", req, &label); err != nil {
		return label, err
	}
	return label, nil
}

func (s *Service) UpdateLabel(ctx context.Context, token TokenEnvelope, labelID string, req UpdateLabelRequest) (Label, error) {
	var label Label
	if strings.TrimSpace(labelID) == "" {
		return label, fmt.Errorf("label id is required")
	}
	if err := s.doJSON(ctx, token, http.MethodPatch, apiURL+"/users/me/labels/"+url.PathEscape(labelID), req, &label); err != nil {
		return label, err
	}
	return label, nil
}

func (s *Service) DeleteLabel(ctx context.Context, token TokenEnvelope, labelID string) error {
	if strings.TrimSpace(labelID) == "" {
		return fmt.Errorf("label id is required")
	}
	return s.doJSON(ctx, token, http.MethodDelete, apiURL+"/users/me/labels/"+url.PathEscape(labelID), nil, nil)
}

func (s *Service) ModifyMessages(ctx context.Context, token TokenEnvelope, req ModifyMessagesRequest) (ModifyMessagesResult, error) {
	resolvedReq, err := s.resolveModifyMessagesRequest(ctx, token, req)
	if err != nil {
		return ModifyMessagesResult{}, err
	}
	if len(resolvedReq.Operations) > 0 {
		return s.modifyMessagesByOperation(ctx, token, resolvedReq)
	}
	ids := cleanedStringSlice(resolvedReq.IDs)
	if len(ids) == 0 {
		return ModifyMessagesResult{}, fmt.Errorf("at least one message id is required")
	}
	addLabelIDs := cleanedStringSlice(resolvedReq.AddLabelIDs)
	removeLabelIDs := cleanedStringSlice(resolvedReq.RemoveLabelIDs)
	body := map[string]any{"ids": ids}
	if len(addLabelIDs) > 0 {
		body["addLabelIds"] = addLabelIDs
	}
	if len(removeLabelIDs) > 0 {
		body["removeLabelIds"] = removeLabelIDs
	}
	if err := s.doJSON(ctx, token, http.MethodPost, apiURL+"/users/me/messages/batchModify", body, nil); err != nil {
		return ModifyMessagesResult{}, err
	}
	return ModifyMessagesResult{
		UpdatedCount:   len(ids),
		AddLabelIDs:    addLabelIDs,
		RemoveLabelIDs: removeLabelIDs,
	}, nil
}

func (s *Service) modifyMessagesByOperation(ctx context.Context, token TokenEnvelope, req ModifyMessagesRequest) (ModifyMessagesResult, error) {
	type groupedMutation struct {
		ids            []string
		addLabelIDs    []string
		removeLabelIDs []string
	}
	groups := map[string]*groupedMutation{}
	applied := make([]ModifyMessageOperationResult, 0, len(req.Operations))
	updated := 0
	for _, op := range req.Operations {
		id := strings.TrimSpace(op.ID)
		if id == "" {
			continue
		}
		addLabelIDs := cleanedStringSlice(op.AddLabelIDs)
		removeLabelIDs := cleanedStringSlice(op.RemoveLabelIDs)
		if len(addLabelIDs) == 0 && len(removeLabelIDs) == 0 {
			continue
		}
		groupKey := strings.Join([]string{
			strings.Join(addLabelIDs, ","),
			strings.Join(removeLabelIDs, ","),
		}, "|")
		group := groups[groupKey]
		if group == nil {
			group = &groupedMutation{
				addLabelIDs:    addLabelIDs,
				removeLabelIDs: removeLabelIDs,
			}
			groups[groupKey] = group
		}
		group.ids = append(group.ids, id)
		applied = append(applied, ModifyMessageOperationResult{
			ID:             id,
			AddLabelIDs:    addLabelIDs,
			RemoveLabelIDs: removeLabelIDs,
		})
		updated++
	}
	if updated == 0 {
		return ModifyMessagesResult{}, fmt.Errorf("at least one message mutation operation is required")
	}
	for _, group := range groups {
		body := map[string]any{"ids": group.ids}
		if len(group.addLabelIDs) > 0 {
			body["addLabelIds"] = group.addLabelIDs
		}
		if len(group.removeLabelIDs) > 0 {
			body["removeLabelIds"] = group.removeLabelIDs
		}
		if err := s.doJSON(ctx, token, http.MethodPost, apiURL+"/users/me/messages/batchModify", body, nil); err != nil {
			return ModifyMessagesResult{}, err
		}
	}
	return ModifyMessagesResult{
		UpdatedCount: updated,
		Operations:   applied,
	}, nil
}

func (s *Service) resolveModifyMessagesRequest(ctx context.Context, token TokenEnvelope, req ModifyMessagesRequest) (ModifyMessagesRequest, error) {
	resolved := ModifyMessagesRequest{
		IDs:            append([]string(nil), req.IDs...),
		AddLabelIDs:    append([]string(nil), req.AddLabelIDs...),
		RemoveLabelIDs: append([]string(nil), req.RemoveLabelIDs...),
		AddLabels:      append([]string(nil), req.AddLabels...),
		RemoveLabels:   append([]string(nil), req.RemoveLabels...),
		Operations:     append([]ModifyMessageOperation(nil), req.Operations...),
	}
	needsResolution := len(resolved.AddLabels) > 0 || len(resolved.RemoveLabels) > 0
	if !needsResolution {
		for _, op := range resolved.Operations {
			if len(op.AddLabels) > 0 || len(op.RemoveLabels) > 0 {
				needsResolution = true
				break
			}
		}
	}
	if !needsResolution {
		return resolved, nil
	}
	labels, err := s.ListLabels(ctx, token)
	if err != nil {
		return ModifyMessagesRequest{}, err
	}
	labelIndex := map[string]string{}
	for _, label := range labels {
		key := normalizeLabelLookupKey(label.Name)
		if key == "" {
			continue
		}
		labelIndex[key] = strings.TrimSpace(label.ID)
	}
	var resolveNames = func(names []string) ([]string, error) {
		resolvedIDs := make([]string, 0, len(names))
		for _, name := range names {
			key := normalizeLabelLookupKey(name)
			if key == "" {
				continue
			}
			labelID, ok := labelIndex[key]
			if !ok {
				return nil, fmt.Errorf("label %q not found", strings.TrimSpace(name))
			}
			resolvedIDs = append(resolvedIDs, labelID)
		}
		return cleanedStringSlice(resolvedIDs), nil
	}
	if len(resolved.AddLabels) > 0 {
		resolvedIDs, err := resolveNames(resolved.AddLabels)
		if err != nil {
			return ModifyMessagesRequest{}, err
		}
		resolved.AddLabelIDs = append(resolved.AddLabelIDs, resolvedIDs...)
		resolved.AddLabels = nil
	}
	if len(resolved.RemoveLabels) > 0 {
		resolvedIDs, err := resolveNames(resolved.RemoveLabels)
		if err != nil {
			return ModifyMessagesRequest{}, err
		}
		resolved.RemoveLabelIDs = append(resolved.RemoveLabelIDs, resolvedIDs...)
		resolved.RemoveLabels = nil
	}
	for index := range resolved.Operations {
		if len(resolved.Operations[index].AddLabels) > 0 {
			resolvedIDs, err := resolveNames(resolved.Operations[index].AddLabels)
			if err != nil {
				return ModifyMessagesRequest{}, err
			}
			resolved.Operations[index].AddLabelIDs = append(resolved.Operations[index].AddLabelIDs, resolvedIDs...)
			resolved.Operations[index].AddLabels = nil
		}
		if len(resolved.Operations[index].RemoveLabels) > 0 {
			resolvedIDs, err := resolveNames(resolved.Operations[index].RemoveLabels)
			if err != nil {
				return ModifyMessagesRequest{}, err
			}
			resolved.Operations[index].RemoveLabelIDs = append(resolved.Operations[index].RemoveLabelIDs, resolvedIDs...)
			resolved.Operations[index].RemoveLabels = nil
		}
	}
	resolved.AddLabelIDs = cleanedStringSlice(resolved.AddLabelIDs)
	resolved.RemoveLabelIDs = cleanedStringSlice(resolved.RemoveLabelIDs)
	for index := range resolved.Operations {
		resolved.Operations[index].ID = strings.TrimSpace(resolved.Operations[index].ID)
		resolved.Operations[index].AddLabelIDs = cleanedStringSlice(resolved.Operations[index].AddLabelIDs)
		resolved.Operations[index].RemoveLabelIDs = cleanedStringSlice(resolved.Operations[index].RemoveLabelIDs)
	}
	return resolved, nil
}

func cleanedStringSlice(items []string) []string {
	if len(items) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	cleaned := make([]string, 0, len(items))
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		cleaned = append(cleaned, trimmed)
	}
	sort.Strings(cleaned)
	return cleaned
}

func normalizeLabelLookupKey(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

func (s *Service) ListFilters(ctx context.Context, token TokenEnvelope) ([]Filter, error) {
	var payload struct {
		Filter []Filter `json:"filter"`
	}
	if err := s.doJSON(ctx, token, http.MethodGet, apiURL+"/users/me/settings/filters", nil, &payload); err != nil {
		return nil, err
	}
	return payload.Filter, nil
}

func (s *Service) CreateFilter(ctx context.Context, token TokenEnvelope, req CreateFilterRequest) (Filter, error) {
	var filter Filter
	if err := s.doJSON(ctx, token, http.MethodPost, apiURL+"/users/me/settings/filters", req, &filter); err != nil {
		return filter, err
	}
	return filter, nil
}

func (s *Service) DeleteFilter(ctx context.Context, token TokenEnvelope, filterID string) error {
	if strings.TrimSpace(filterID) == "" {
		return fmt.Errorf("filter id is required")
	}
	return s.doJSON(ctx, token, http.MethodDelete, apiURL+"/users/me/settings/filters/"+url.PathEscape(filterID), nil, nil)
}

func (s *Service) Send(ctx context.Context, token TokenEnvelope, req SendRequest) (SendResult, error) {
	if len(req.To) == 0 {
		return SendResult{}, fmt.Errorf("at least one recipient is required")
	}
	rawMessage, err := buildRawMessage(req.To, req.Cc, req.Bcc, req.Subject, req.Body, req.Attachments)
	if err != nil {
		return SendResult{}, err
	}
	body := map[string]string{"raw": rawMessage}

	var response SendResult
	if err := s.doJSON(ctx, token, http.MethodPost, apiURL+"/users/me/messages/send", body, &response); err != nil {
		return SendResult{}, err
	}
	return response, nil
}

func (s *Service) ListDrafts(ctx context.Context, token TokenEnvelope, opts ListDraftsOptions) (ListDraftsResult, error) {
	type listResponse struct {
		Drafts []struct {
			ID string `json:"id"`
		} `json:"drafts"`
		NextPageToken      string `json:"nextPageToken"`
		ResultSizeEstimate int    `json:"resultSizeEstimate"`
	}

	pageSize := opts.PageSize
	if pageSize <= 0 || pageSize > 25 {
		pageSize = 10
	}
	endpoint, err := url.Parse(apiURL + "/users/me/drafts")
	if err != nil {
		return ListDraftsResult{}, err
	}
	values := endpoint.Query()
	values.Set("maxResults", strconv.Itoa(pageSize))
	if trimmed := strings.TrimSpace(opts.PageToken); trimmed != "" {
		values.Set("pageToken", trimmed)
	}
	endpoint.RawQuery = values.Encode()

	var list listResponse
	if err := s.doJSON(ctx, token, http.MethodGet, endpoint.String(), nil, &list); err != nil {
		return ListDraftsResult{}, err
	}

	result := ListDraftsResult{
		NextPageToken:      list.NextPageToken,
		ResultSizeEstimate: list.ResultSizeEstimate,
	}
	for _, item := range list.Drafts {
		draft, err := s.GetDraft(ctx, token, item.ID)
		if err != nil {
			return ListDraftsResult{}, err
		}
		result.Drafts = append(result.Drafts, summarizeDraft(draft))
	}
	sort.SliceStable(result.Drafts, func(i, j int) bool {
		left := result.Drafts[i].ReceivedAt
		right := result.Drafts[j].ReceivedAt
		switch {
		case left.IsZero() && right.IsZero():
			return result.Drafts[i].ID < result.Drafts[j].ID
		case left.IsZero():
			return false
		case right.IsZero():
			return true
		default:
			return left.After(right)
		}
	})
	return result, nil
}

func (s *Service) GetDraft(ctx context.Context, token TokenEnvelope, draftID string) (Draft, error) {
	draftID = strings.TrimSpace(draftID)
	if draftID == "" {
		return Draft{}, fmt.Errorf("draft id is required")
	}

	var payload struct {
		ID      string `json:"id"`
		Message struct {
			ID           string      `json:"id"`
			ThreadID     string      `json:"threadId"`
			Snippet      string      `json:"snippet"`
			InternalDate string      `json:"internalDate"`
			Payload      messagePart `json:"payload"`
		} `json:"message"`
	}
	if err := s.doJSON(ctx, token, http.MethodGet, apiURL+"/users/me/drafts/"+url.PathEscape(draftID)+"?format=full", nil, &payload); err != nil {
		return Draft{}, err
	}
	headers := headersToMap(payload.Message.Payload.Headers)
	return Draft{
		ID:          payload.ID,
		MessageID:   payload.Message.ID,
		ThreadID:    payload.Message.ThreadID,
		To:          headers["to"],
		Cc:          headers["cc"],
		Bcc:         headers["bcc"],
		Subject:     headers["subject"],
		Snippet:     payload.Message.Snippet,
		Body:        decodeBody(payload.Message.Payload),
		Attachments: collectMessageAttachments(payload.Message.Payload, payload.Message.ID),
		ReceivedAt:  parseMessageTime(headers["date"], payload.Message.InternalDate),
	}, nil
}

func (s *Service) CreateDraft(ctx context.Context, token TokenEnvelope, req DraftRequest) (DraftResult, error) {
	body, err := draftRequestBody("", req)
	if err != nil {
		return DraftResult{}, err
	}
	var response struct {
		ID      string `json:"id"`
		Message struct {
			ID       string `json:"id"`
			ThreadID string `json:"threadId"`
		} `json:"message"`
	}
	if err := s.doJSON(ctx, token, http.MethodPost, apiURL+"/users/me/drafts", body, &response); err != nil {
		return DraftResult{}, err
	}
	return decodeDraftResult(response.ID, response.Message.ID, response.Message.ThreadID, req.ThreadID), nil
}

func (s *Service) UpdateDraft(ctx context.Context, token TokenEnvelope, draftID string, req DraftRequest) (DraftResult, error) {
	draftID = strings.TrimSpace(draftID)
	if draftID == "" {
		return DraftResult{}, fmt.Errorf("draft id is required")
	}
	body, err := draftRequestBody(draftID, req)
	if err != nil {
		return DraftResult{}, err
	}
	var response struct {
		ID      string `json:"id"`
		Message struct {
			ID       string `json:"id"`
			ThreadID string `json:"threadId"`
		} `json:"message"`
	}
	if err := s.doJSON(ctx, token, http.MethodPut, apiURL+"/users/me/drafts/"+url.PathEscape(draftID), body, &response); err != nil {
		return DraftResult{}, err
	}
	return decodeDraftResult(response.ID, response.Message.ID, response.Message.ThreadID, req.ThreadID), nil
}

func (s *Service) DeleteDraft(ctx context.Context, token TokenEnvelope, draftID string) error {
	draftID = strings.TrimSpace(draftID)
	if draftID == "" {
		return fmt.Errorf("draft id is required")
	}
	return s.doJSON(ctx, token, http.MethodDelete, apiURL+"/users/me/drafts/"+url.PathEscape(draftID), nil, nil)
}

func (s *Service) SendDraft(ctx context.Context, token TokenEnvelope, draftID string) (SendResult, error) {
	draftID = strings.TrimSpace(draftID)
	if draftID == "" {
		return SendResult{}, fmt.Errorf("draft id is required")
	}
	var response SendResult
	if err := s.doJSON(ctx, token, http.MethodPost, apiURL+"/users/me/drafts/send", map[string]any{"id": draftID}, &response); err != nil {
		return SendResult{}, err
	}
	return response, nil
}

func (s *Service) TrashMessage(ctx context.Context, token TokenEnvelope, messageID string) (MessageMutationResult, error) {
	return s.mutateMessage(ctx, token, messageID, "trash")
}

func (s *Service) UntrashMessage(ctx context.Context, token TokenEnvelope, messageID string) (MessageMutationResult, error) {
	return s.mutateMessage(ctx, token, messageID, "untrash")
}

func (s *Service) DeleteMessage(ctx context.Context, token TokenEnvelope, messageID string) error {
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return fmt.Errorf("message id is required")
	}
	return s.doJSON(ctx, token, http.MethodDelete, apiURL+"/users/me/messages/"+url.PathEscape(messageID), nil, nil)
}

func buildRawMessage(to, cc, bcc []string, subject, body string, attachments []OutboundAttachment) (string, error) {
	var raw bytes.Buffer
	if len(to) > 0 {
		raw.WriteString("To: " + strings.Join(to, ", ") + "\r\n")
	}
	if len(cc) > 0 {
		raw.WriteString("Cc: " + strings.Join(cc, ", ") + "\r\n")
	}
	if len(bcc) > 0 {
		raw.WriteString("Bcc: " + strings.Join(bcc, ", ") + "\r\n")
	}
	raw.WriteString("Subject: " + sanitizeHeader(subject) + "\r\n")
	raw.WriteString("MIME-Version: 1.0\r\n")
	if len(attachments) == 0 {
		raw.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
		raw.WriteString("\r\n")
		raw.WriteString(body)
		return base64.RawURLEncoding.EncodeToString(raw.Bytes()), nil
	}

	mixedWriter := multipart.NewWriter(&raw)
	raw.WriteString(fmt.Sprintf("Content-Type: multipart/mixed; boundary=%q\r\n", mixedWriter.Boundary()))
	raw.WriteString("\r\n")

	textHeader := textproto.MIMEHeader{}
	textHeader.Set("Content-Type", "text/plain; charset=UTF-8")
	textPart, err := mixedWriter.CreatePart(textHeader)
	if err != nil {
		return "", err
	}
	if _, err := io.WriteString(textPart, body); err != nil {
		return "", err
	}
	for _, attachment := range attachments {
		filename := sanitizeAttachmentFilename(attachment.Filename)
		if filename == "" {
			return "", fmt.Errorf("attachment filename is required")
		}
		if len(attachment.Data) == 0 {
			return "", fmt.Errorf("attachment %q is empty", filename)
		}
		attachmentHeader := textproto.MIMEHeader{}
		attachmentHeader.Set("Content-Type", firstNonEmpty(strings.TrimSpace(attachment.MimeType), mimeTypeFromFilename(filename), "application/octet-stream"))
		attachmentHeader.Set("Content-Transfer-Encoding", "base64")
		attachmentHeader.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, sanitizeHeader(filename)))
		attachmentPart, err := mixedWriter.CreatePart(attachmentHeader)
		if err != nil {
			return "", err
		}
		if _, err := io.WriteString(attachmentPart, wrapBase64MIME(attachment.Data)); err != nil {
			return "", err
		}
	}
	if err := mixedWriter.Close(); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw.Bytes()), nil
}

func draftRequestBody(draftID string, req DraftRequest) (map[string]any, error) {
	rawMessage, err := buildRawMessage(req.To, req.Cc, req.Bcc, req.Subject, req.Body, req.Attachments)
	if err != nil {
		return nil, err
	}
	message := map[string]any{
		"raw": rawMessage,
	}
	if threadID := strings.TrimSpace(req.ThreadID); threadID != "" {
		message["threadId"] = threadID
	}
	body := map[string]any{"message": message}
	if trimmed := strings.TrimSpace(draftID); trimmed != "" {
		body["id"] = trimmed
	}
	return body, nil
}

func decodeDraftResult(id, messageID, threadID, requestedThreadID string) DraftResult {
	return DraftResult{
		ID:        strings.TrimSpace(id),
		MessageID: strings.TrimSpace(messageID),
		ThreadID:  firstNonEmpty(strings.TrimSpace(threadID), strings.TrimSpace(requestedThreadID)),
	}
}

func summarizeDraft(draft Draft) DraftSummary {
	return DraftSummary{
		ID:          draft.ID,
		MessageID:   draft.MessageID,
		ThreadID:    draft.ThreadID,
		To:          draft.To,
		Cc:          draft.Cc,
		Bcc:         draft.Bcc,
		Subject:     draft.Subject,
		Snippet:     draft.Snippet,
		Attachments: draft.Attachments,
		ReceivedAt:  draft.ReceivedAt,
	}
}

func (s *Service) mutateMessage(ctx context.Context, token TokenEnvelope, messageID string, action string) (MessageMutationResult, error) {
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return MessageMutationResult{}, fmt.Errorf("message id is required")
	}
	action = strings.TrimSpace(action)
	if action == "" {
		return MessageMutationResult{}, fmt.Errorf("message action is required")
	}
	var response MessageMutationResult
	if err := s.doJSON(ctx, token, http.MethodPost, apiURL+"/users/me/messages/"+url.PathEscape(messageID)+"/"+action, nil, &response); err != nil {
		return MessageMutationResult{}, err
	}
	if response.ID == "" {
		response.ID = messageID
	}
	return response, nil
}

func ParseRecipients(value string) ([]string, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	addresses, err := mail.ParseAddressList(value)
	if err != nil {
		return nil, err
	}
	result := make([]string, 0, len(addresses))
	for _, address := range addresses {
		result = append(result, address.Address)
	}
	return result, nil
}

func (s *Service) sealState(state OAuthState) (string, error) {
	raw, err := json.Marshal(state)
	if err != nil {
		return "", fmt.Errorf("encode oauth state: %w", err)
	}
	return s.sealer.Encrypt(raw)
}

func (s *Service) exchangeToken(ctx context.Context, values url.Values) (TokenEnvelope, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(values.Encode()))
	if err != nil {
		return TokenEnvelope{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := s.httpClient.Do(req)
	if err != nil {
		return TokenEnvelope{}, err
	}
	defer response.Body.Close()

	var payload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		TokenType    string `json:"token_type"`
		Scope        string `json:"scope"`
		ExpiresIn    int    `json:"expires_in"`
		Error        string `json:"error"`
		ErrorDesc    string `json:"error_description"`
	}
	if err := decodeResponse(response, &payload); err != nil {
		return TokenEnvelope{}, err
	}
	if response.StatusCode >= 400 {
		return TokenEnvelope{}, fmt.Errorf("token exchange failed: %s", firstNonEmpty(payload.ErrorDesc, payload.Error, response.Status))
	}
	return TokenEnvelope{
		AccessToken:  payload.AccessToken,
		RefreshToken: payload.RefreshToken,
		TokenType:    firstNonEmpty(payload.TokenType, "Bearer"),
		Scope:        payload.Scope,
		Expiry:       time.Now().UTC().Add(time.Duration(payload.ExpiresIn) * time.Second),
	}, nil
}

func (s *Service) doJSON(ctx context.Context, token TokenEnvelope, method, endpoint string, body any, dest any) error {
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
		return fmt.Errorf("gmail api failed: %s", firstNonEmpty(apiErr.Error.Message, response.Status))
	}
	if dest == nil {
		return nil
	}
	return decodeResponse(response, dest)
}

func decodeResponse(response *http.Response, dest any) error {
	raw, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return err
	}
	if len(raw) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, dest); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}

type messagePart struct {
	MimeType string `json:"mimeType"`
	Filename string `json:"filename"`
	Body     struct {
		Data         string `json:"data"`
		AttachmentID string `json:"attachmentId"`
		Size         int64  `json:"size"`
	} `json:"body"`
	Headers []struct {
		Name  string `json:"name"`
		Value string `json:"value"`
	} `json:"headers"`
	Parts []messagePart `json:"parts"`
}

func decodeBody(part messagePart) string {
	if body := decodeBodyByPreference(part, "text/plain"); body != "" {
		return body
	}
	if body := decodeBodyByPreference(part, "text/html"); body != "" {
		return body
	}
	return decodePartBody(part)
}

func decodeBodyByPreference(part messagePart, preferredMime string) string {
	if partLooksLikeAttachment(part) {
		return ""
	}
	if strings.Contains(strings.ToLower(part.MimeType), preferredMime) {
		if body := decodePartBody(part); body != "" {
			return body
		}
	}
	for _, child := range part.Parts {
		if body := decodeBodyByPreference(child, preferredMime); body != "" {
			return body
		}
	}
	return ""
}

func decodePartBody(part messagePart) string {
	data := strings.TrimSpace(part.Body.Data)
	if data == "" {
		return ""
	}
	raw, err := base64.RawURLEncoding.DecodeString(data)
	if err != nil {
		return ""
	}
	decoded := string(raw)
	if strings.Contains(strings.ToLower(part.MimeType), "html") {
		return strings.TrimSpace(stripHTML(decoded))
	}
	return strings.TrimSpace(decoded)
}

func collectMessageAttachments(part messagePart, messageID string) []AttachmentSummary {
	attachments := make([]AttachmentSummary, 0)
	var walk func(messagePart)
	walk = func(current messagePart) {
		if summary, ok := attachmentSummaryFromPart(current, messageID); ok {
			attachments = append(attachments, summary)
		}
		for _, child := range current.Parts {
			walk(child)
		}
	}
	walk(part)
	return attachments
}

func attachmentSummaryFromPart(part messagePart, messageID string) (AttachmentSummary, bool) {
	if !partLooksLikeAttachment(part) {
		return AttachmentSummary{}, false
	}
	headers := headersToMap(part.Headers)
	contentID := strings.Trim(strings.TrimSpace(headers["content-id"]), "<>")
	contentDisposition := strings.ToLower(strings.TrimSpace(headers["content-disposition"]))
	size := part.Body.Size
	if size == 0 {
		if data, err := decodeBase64URLData(part.Body.Data); err == nil {
			size = int64(len(data))
		}
	}
	return AttachmentSummary{
		ID:        attachmentReference(part),
		MessageID: strings.TrimSpace(messageID),
		Filename:  strings.TrimSpace(part.Filename),
		MimeType:  strings.TrimSpace(part.MimeType),
		Size:      size,
		Inline:    strings.Contains(contentDisposition, "inline"),
		ContentID: contentID,
	}, true
}

func partLooksLikeAttachment(part messagePart) bool {
	return strings.TrimSpace(part.Filename) != "" || strings.TrimSpace(part.Body.AttachmentID) != ""
}

func attachmentReference(part messagePart) string {
	if id := strings.TrimSpace(part.Body.AttachmentID); id != "" {
		return id
	}
	headers := headersToMap(part.Headers)
	signature := strings.Join([]string{
		strings.TrimSpace(part.Filename),
		strings.TrimSpace(part.MimeType),
		strings.Trim(strings.TrimSpace(headers["content-id"]), "<>"),
		strings.TrimSpace(headers["content-disposition"]),
		strconv.FormatInt(part.Body.Size, 10),
	}, "\n")
	return "inline:" + base64.RawURLEncoding.EncodeToString([]byte(signature))
}

func (s *Service) getAttachmentPart(ctx context.Context, token TokenEnvelope, messageID, attachmentID string) (messagePart, AttachmentSummary, error) {
	var payload struct {
		ID      string      `json:"id"`
		Payload messagePart `json:"payload"`
	}
	if err := s.doJSON(ctx, token, http.MethodGet, apiURL+"/users/me/messages/"+url.PathEscape(messageID)+"?format=full", nil, &payload); err != nil {
		return messagePart{}, AttachmentSummary{}, err
	}
	part, summary, found := findAttachmentPart(payload.Payload, messageID, attachmentID)
	if !found {
		return messagePart{}, AttachmentSummary{}, fmt.Errorf("attachment %q not found on message %q", attachmentID, messageID)
	}
	return part, summary, nil
}

func findAttachmentPart(part messagePart, messageID, attachmentID string) (messagePart, AttachmentSummary, bool) {
	if summary, ok := attachmentSummaryFromPart(part, messageID); ok && summary.ID == attachmentID {
		return part, summary, true
	}
	for _, child := range part.Parts {
		if foundPart, summary, ok := findAttachmentPart(child, messageID, attachmentID); ok {
			return foundPart, summary, true
		}
	}
	return messagePart{}, AttachmentSummary{}, false
}

func (s *Service) readAttachmentData(ctx context.Context, token TokenEnvelope, messageID, attachmentID string, part messagePart) ([]byte, error) {
	if strings.TrimSpace(part.Body.Data) != "" {
		data, err := decodeBase64URLData(part.Body.Data)
		if err != nil {
			return nil, fmt.Errorf("decode inline attachment data: %w", err)
		}
		return data, nil
	}
	attachmentID = firstNonEmpty(strings.TrimSpace(part.Body.AttachmentID), strings.TrimSpace(attachmentID))
	if attachmentID == "" {
		return nil, fmt.Errorf("attachment payload is empty")
	}
	var payload struct {
		Data string `json:"data"`
		Size int64  `json:"size"`
	}
	endpoint := apiURL + "/users/me/messages/" + url.PathEscape(messageID) + "/attachments/" + url.PathEscape(attachmentID)
	if err := s.doJSON(ctx, token, http.MethodGet, endpoint, nil, &payload); err != nil {
		return nil, err
	}
	data, err := decodeBase64URLData(payload.Data)
	if err != nil {
		return nil, fmt.Errorf("decode attachment data: %w", err)
	}
	return data, nil
}

func mergeAttachmentSummary(base, incoming AttachmentSummary) AttachmentSummary {
	if strings.TrimSpace(base.ID) == "" {
		base.ID = incoming.ID
	}
	if strings.TrimSpace(base.MessageID) == "" {
		base.MessageID = incoming.MessageID
	}
	if strings.TrimSpace(base.Filename) == "" {
		base.Filename = incoming.Filename
	}
	if strings.TrimSpace(base.MimeType) == "" {
		base.MimeType = incoming.MimeType
	}
	if base.Size == 0 {
		base.Size = incoming.Size
	}
	if !base.Inline {
		base.Inline = incoming.Inline
	}
	if strings.TrimSpace(base.ContentID) == "" {
		base.ContentID = incoming.ContentID
	}
	return base
}

func decodeBase64URLData(value string) ([]byte, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	return base64.RawURLEncoding.DecodeString(value)
}

const attachmentPreviewLimit = 64 << 10

func previewAttachmentContent(data []byte, mimeType, filename string) (string, bool, bool) {
	if !attachmentPreviewable(mimeType, filename) {
		return "", false, false
	}
	truncated := len(data) > attachmentPreviewLimit
	if truncated {
		data = data[:attachmentPreviewLimit]
	}
	content := string(data)
	lowerMime := strings.ToLower(strings.TrimSpace(mimeType))
	lowerExt := strings.ToLower(filepath.Ext(strings.TrimSpace(filename)))
	if strings.Contains(lowerMime, "html") || lowerExt == ".html" || lowerExt == ".htm" {
		content = stripHTML(content)
	} else {
		content = strings.TrimSpace(content)
	}
	return content, true, truncated
}

func attachmentPreviewable(mimeType, filename string) bool {
	lowerMime := strings.ToLower(strings.TrimSpace(mimeType))
	switch {
	case strings.HasPrefix(lowerMime, "text/"):
		return true
	case lowerMime == "application/json",
		lowerMime == "application/ld+json",
		lowerMime == "application/xml",
		lowerMime == "application/yaml",
		lowerMime == "application/x-yaml",
		lowerMime == "application/javascript",
		lowerMime == "application/x-javascript",
		lowerMime == "application/sql":
		return true
	}
	switch strings.ToLower(filepath.Ext(strings.TrimSpace(filename))) {
	case ".txt", ".md", ".markdown", ".json", ".xml", ".csv", ".log", ".yaml", ".yml", ".html", ".htm", ".js", ".ts", ".sql":
		return true
	default:
		return false
	}
}

var (
	htmlTagPattern       = regexp.MustCompile(`(?s)<[^>]+>`)
	htmlScriptPattern    = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	htmlStylePattern     = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	htmlCommentPattern   = regexp.MustCompile(`(?s)<!--.*?-->`)
	htmlWhitespacePatten = regexp.MustCompile(`\s+`)
)

func stripHTML(value string) string {
	cleaned := htmlCommentPattern.ReplaceAllString(value, " ")
	cleaned = htmlScriptPattern.ReplaceAllString(cleaned, " ")
	cleaned = htmlStylePattern.ReplaceAllString(cleaned, " ")
	cleaned = htmlTagPattern.ReplaceAllString(cleaned, " ")
	cleaned = html.UnescapeString(cleaned)
	cleaned = strings.ReplaceAll(cleaned, "\u00a0", " ")
	return strings.TrimSpace(htmlWhitespacePatten.ReplaceAllString(cleaned, " "))
}

func headersToMap(headers []struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}) map[string]string {
	result := make(map[string]string, len(headers))
	for _, header := range headers {
		key := strings.ToLower(strings.TrimSpace(header.Name))
		if key == "" {
			continue
		}
		result[key] = strings.TrimSpace(header.Value)
	}
	return result
}

func parseMessageTime(dateHeader, internalDate string) time.Time {
	for _, layout := range []string{time.RFC1123Z, time.RFC1123, time.RFC822Z, time.RFC822, time.RFC850, time.ANSIC} {
		if parsed, err := time.Parse(layout, strings.TrimSpace(dateHeader)); err == nil {
			return parsed.UTC()
		}
	}
	if millis, err := strconv.ParseInt(strings.TrimSpace(internalDate), 10, 64); err == nil && millis > 0 {
		return time.UnixMilli(millis).UTC()
	}
	return time.Time{}
}

func sanitizeHeader(value string) string {
	value = strings.ReplaceAll(value, "\r", " ")
	value = strings.ReplaceAll(value, "\n", " ")
	return strings.TrimSpace(value)
}

func sanitizeAttachmentFilename(value string) string {
	value = filepath.Base(strings.TrimSpace(value))
	if value == "." || value == "" {
		return ""
	}
	return sanitizeHeader(value)
}

func mimeTypeFromFilename(filename string) string {
	return strings.TrimSpace(mime.TypeByExtension(strings.ToLower(filepath.Ext(strings.TrimSpace(filename)))))
}

func wrapBase64MIME(data []byte) string {
	encoded := base64.StdEncoding.EncodeToString(data)
	if encoded == "" {
		return ""
	}
	var builder strings.Builder
	for start := 0; start < len(encoded); start += 76 {
		end := start + 76
		if end > len(encoded) {
			end = len(encoded)
		}
		builder.WriteString(encoded[start:end])
		builder.WriteString("\r\n")
	}
	return builder.String()
}

func normalizeSortOrder(order string) string {
	switch strings.ToLower(strings.TrimSpace(order)) {
	case "oldest", "asc", "ascending":
		return "oldest"
	default:
		return "newest"
	}
}

func sortMessageSummaries(messages []MessageSummary, order string) []MessageSummary {
	sorted := append([]MessageSummary(nil), messages...)
	sort.SliceStable(sorted, func(i, j int) bool {
		return compareTimes(sorted[i].ReceivedAt, sorted[j].ReceivedAt, order, sorted[i].ID, sorted[j].ID)
	})
	return sorted
}

func sortThreadMessages(messages []ThreadMessage, order string) []ThreadMessage {
	sorted := append([]ThreadMessage(nil), messages...)
	sort.SliceStable(sorted, func(i, j int) bool {
		return compareTimes(sorted[i].ReceivedAt, sorted[j].ReceivedAt, order, sorted[i].ID, sorted[j].ID)
	})
	return sorted
}

func buildThreadSummaries(messages []MessageSummary, threadOrder, messageOrder string) []ThreadSummary {
	grouped := make(map[string]*ThreadSummary)
	threadIDs := make([]string, 0)
	for _, message := range messages {
		threadID := strings.TrimSpace(message.ThreadID)
		if threadID == "" {
			threadID = message.ID
		}
		thread, ok := grouped[threadID]
		if !ok {
			thread = &ThreadSummary{ID: threadID}
			grouped[threadID] = thread
			threadIDs = append(threadIDs, threadID)
		}
		thread.Messages = append(thread.Messages, message)
		thread.MessageCount++
		if thread.LatestReceivedAt.IsZero() || (!message.ReceivedAt.IsZero() && message.ReceivedAt.After(thread.LatestReceivedAt)) {
			thread.LatestReceivedAt = message.ReceivedAt
		}
		if thread.OldestReceivedAt.IsZero() || (!message.ReceivedAt.IsZero() && message.ReceivedAt.Before(thread.OldestReceivedAt)) {
			thread.OldestReceivedAt = message.ReceivedAt
		}
	}

	threads := make([]ThreadSummary, 0, len(threadIDs))
	for _, threadID := range threadIDs {
		thread := grouped[threadID]
		thread.Messages = sortMessageSummaries(thread.Messages, messageOrder)
		if len(thread.Messages) > 0 {
			anchor := thread.Messages[0]
			thread.Subject = anchor.Subject
			thread.From = anchor.From
			thread.Snippet = anchor.Snippet
		}
		threads = append(threads, *thread)
	}
	sort.SliceStable(threads, func(i, j int) bool {
		return compareTimes(threads[i].LatestReceivedAt, threads[j].LatestReceivedAt, threadOrder, threads[i].ID, threads[j].ID)
	})
	return threads
}

func flattenThreadSummaries(threads []ThreadSummary) []MessageSummary {
	flattened := make([]MessageSummary, 0)
	for _, thread := range threads {
		flattened = append(flattened, thread.Messages...)
	}
	return flattened
}

func compareTimes(left, right time.Time, order, leftID, rightID string) bool {
	normalized := normalizeSortOrder(order)
	switch {
	case left.IsZero() && right.IsZero():
		return leftID < rightID
	case left.IsZero():
		return false
	case right.IsZero():
		return true
	case left.Equal(right):
		return leftID < rightID
	case normalized == "oldest":
		return left.Before(right)
	default:
		return left.After(right)
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
