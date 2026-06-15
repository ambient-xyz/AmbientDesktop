package googledrive

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/ambient-xyz/AmbientDesktop/sidecars/google/internal/gmail"
)

const (
	apiURL             = "https://www.googleapis.com/drive/v3"
	uploadURL          = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
	uploadUpdatePrefix = "https://www.googleapis.com/upload/drive/v3/files/"
	folderMimeType     = "application/vnd.google-apps.folder"
	driveFileFields    = "id,name,mimeType,webViewLink,modifiedTime,size,parents,trashed,driveId"
	permissionFields   = "id,type,role,emailAddress,domain,displayName,allowFileDiscovery,deleted,pendingOwner,expirationTime"
	sharedDriveFields  = "id,name,hidden,createdTime"
)

type Service struct {
	httpClient *http.Client
}

type File struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	MimeType    string    `json:"mimeType"`
	DriveID     string    `json:"driveId,omitempty"`
	WebViewLink string    `json:"webViewLink,omitempty"`
	ModifiedAt  time.Time `json:"modifiedAt,omitempty"`
	Size        int64     `json:"size,omitempty"`
	Parents     []string  `json:"parents,omitempty"`
	IsFolder    bool      `json:"isFolder,omitempty"`
	Trashed     bool      `json:"trashed,omitempty"`
	Content     string    `json:"content,omitempty"`
}

type ListFilesOptions struct {
	Query            string `json:"query,omitempty"`
	PageSize         int    `json:"pageSize,omitempty"`
	SharedDriveID    string `json:"sharedDriveId,omitempty"`
	IncludeAllDrives bool   `json:"includeAllDrives,omitempty"`
}

type CreateTextFileRequest struct {
	Name     string `json:"name"`
	Content  string `json:"content"`
	FolderID string `json:"folderId,omitempty"`
}

type CreateFileRequest struct {
	Name     string `json:"name"`
	MimeType string `json:"mimeType,omitempty"`
	Content  []byte `json:"-"`
	FolderID string `json:"folderId,omitempty"`
}

type CreateFolderRequest struct {
	Name     string `json:"name"`
	FolderID string `json:"folderId,omitempty"`
}

type UpdateFileRequest struct {
	Name           *string `json:"name,omitempty"`
	Content        *string `json:"content,omitempty"`
	ParentFolderID *string `json:"parentFolderId,omitempty"`
}

type CopyFileRequest struct {
	Name     string `json:"name,omitempty"`
	FolderID string `json:"folderId,omitempty"`
}

type SharedDrive struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Hidden    bool      `json:"hidden,omitempty"`
	CreatedAt time.Time `json:"createdAt,omitempty"`
}

type Permission struct {
	ID                 string    `json:"id"`
	Type               string    `json:"type"`
	Role               string    `json:"role"`
	EmailAddress       string    `json:"emailAddress,omitempty"`
	Domain             string    `json:"domain,omitempty"`
	DisplayName        string    `json:"displayName,omitempty"`
	AllowFileDiscovery bool      `json:"allowFileDiscovery,omitempty"`
	Deleted            bool      `json:"deleted,omitempty"`
	PendingOwner       bool      `json:"pendingOwner,omitempty"`
	ExpirationTime     time.Time `json:"expirationTime,omitempty"`
}

type CreatePermissionRequest struct {
	Type                  string `json:"type"`
	Role                  string `json:"role"`
	EmailAddress          string `json:"emailAddress,omitempty"`
	Domain                string `json:"domain,omitempty"`
	AllowFileDiscovery    *bool  `json:"allowFileDiscovery,omitempty"`
	SendNotificationEmail *bool  `json:"sendNotificationEmail,omitempty"`
	EmailMessage          string `json:"emailMessage,omitempty"`
}

type UpdatePermissionRequest struct {
	Role               *string `json:"role,omitempty"`
	AllowFileDiscovery *bool   `json:"allowFileDiscovery,omitempty"`
}

type driveFilePayload struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	MimeType     string   `json:"mimeType"`
	DriveID      string   `json:"driveId"`
	WebViewLink  string   `json:"webViewLink"`
	ModifiedTime string   `json:"modifiedTime"`
	Size         string   `json:"size"`
	Parents      []string `json:"parents"`
	Trashed      bool     `json:"trashed"`
}

type permissionPayload struct {
	ID                 string `json:"id"`
	Type               string `json:"type"`
	Role               string `json:"role"`
	EmailAddress       string `json:"emailAddress"`
	Domain             string `json:"domain"`
	DisplayName        string `json:"displayName"`
	AllowFileDiscovery bool   `json:"allowFileDiscovery"`
	Deleted            bool   `json:"deleted"`
	PendingOwner       bool   `json:"pendingOwner"`
	ExpirationTime     string `json:"expirationTime"`
}

type sharedDrivePayload struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Hidden      bool   `json:"hidden"`
	CreatedTime string `json:"createdTime"`
}

func New() *Service {
	return &Service{httpClient: &http.Client{Timeout: 25 * time.Second}}
}

func (s *Service) ListFiles(ctx context.Context, token gmail.TokenEnvelope, opts ListFilesOptions) ([]File, error) {
	if opts.PageSize <= 0 || opts.PageSize > 50 {
		opts.PageSize = 10
	}
	endpoint, err := url.Parse(apiURL + "/files")
	if err != nil {
		return nil, err
	}
	values := endpoint.Query()
	values.Set("pageSize", strconv.Itoa(opts.PageSize))
	values.Set("fields", "files("+driveFileFields+")")
	values.Set("supportsAllDrives", "true")
	normalizedQuery, orderBy := parseDriveListQuery(opts.Query)
	if normalizedQuery != "" {
		values.Set("q", normalizedQuery)
	}
	if orderBy != "" {
		values.Set("orderBy", orderBy)
	}
	if trimmed := strings.TrimSpace(opts.SharedDriveID); trimmed != "" {
		values.Set("corpora", "drive")
		values.Set("driveId", trimmed)
		values.Set("includeItemsFromAllDrives", "true")
	} else if opts.IncludeAllDrives {
		values.Set("corpora", "allDrives")
		values.Set("includeItemsFromAllDrives", "true")
	}
	endpoint.RawQuery = values.Encode()

	var payload struct {
		Files []driveFilePayload `json:"files"`
	}
	if err := s.doJSON(ctx, token, http.MethodGet, endpoint.String(), nil, "", &payload); err != nil {
		return nil, err
	}
	files := make([]File, 0, len(payload.Files))
	for _, item := range payload.Files {
		files = append(files, driveFileFromPayload(item))
	}
	return files, nil
}

func (s *Service) GetFile(ctx context.Context, token gmail.TokenEnvelope, fileID string) (File, error) {
	payload, err := s.getFileMetadata(ctx, token, fileID)
	if err != nil {
		return File{}, err
	}
	file := driveFileFromPayload(payload)
	s.attachFileContent(ctx, token, &file)
	return file, nil
}

func (s *Service) ListSharedDrives(ctx context.Context, token gmail.TokenEnvelope, pageSize int) ([]SharedDrive, error) {
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 25
	}
	endpoint, err := url.Parse(apiURL + "/drives")
	if err != nil {
		return nil, err
	}
	values := endpoint.Query()
	values.Set("pageSize", strconv.Itoa(pageSize))
	values.Set("fields", "drives("+sharedDriveFields+")")
	endpoint.RawQuery = values.Encode()

	var payload struct {
		Drives []sharedDrivePayload `json:"drives"`
	}
	if err := s.doJSON(ctx, token, http.MethodGet, endpoint.String(), nil, "", &payload); err != nil {
		return nil, err
	}
	drives := make([]SharedDrive, 0, len(payload.Drives))
	for _, item := range payload.Drives {
		drives = append(drives, sharedDriveFromPayload(item))
	}
	return drives, nil
}

func (s *Service) CreateTextFile(ctx context.Context, token gmail.TokenEnvelope, req CreateTextFileRequest) (File, error) {
	return s.CreateFile(ctx, token, CreateFileRequest{
		Name:     req.Name,
		MimeType: "text/plain",
		Content:  []byte(req.Content),
		FolderID: req.FolderID,
	})
}

func (s *Service) CreateFile(ctx context.Context, token gmail.TokenEnvelope, req CreateFileRequest) (File, error) {
	if strings.TrimSpace(req.Name) == "" {
		return File{}, fmt.Errorf("file name is required")
	}
	if len(req.Content) == 0 {
		return File{}, fmt.Errorf("file content is required")
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	metaHeader := textproto.MIMEHeader{}
	metaHeader.Set("Content-Type", "application/json; charset=UTF-8")
	metaPart, err := writer.CreatePart(metaHeader)
	if err != nil {
		return File{}, err
	}
	metadata := map[string]any{
		"name":     req.Name,
		"mimeType": firstNonEmpty(strings.TrimSpace(req.MimeType), "text/plain"),
	}
	if strings.TrimSpace(req.FolderID) != "" {
		metadata["parents"] = []string{req.FolderID}
	}
	if err := json.NewEncoder(metaPart).Encode(metadata); err != nil {
		return File{}, err
	}

	contentHeader := textproto.MIMEHeader{}
	contentHeader.Set("Content-Type", firstNonEmpty(strings.TrimSpace(req.MimeType), "text/plain"))
	contentPart, err := writer.CreatePart(contentHeader)
	if err != nil {
		return File{}, err
	}
	if _, err := contentPart.Write(req.Content); err != nil {
		return File{}, err
	}
	if err := writer.Close(); err != nil {
		return File{}, err
	}

	var created driveFilePayload
	createURL, err := appendDriveQuery(uploadURL, func(values url.Values) {
		values.Set("fields", driveFileFields)
		values.Set("supportsAllDrives", "true")
	})
	if err != nil {
		return File{}, err
	}
	if err := s.doJSON(ctx, token, http.MethodPost, createURL, &body, writer.FormDataContentType(), &created); err != nil {
		return File{}, err
	}
	file := driveFileFromPayload(created)
	if strings.HasPrefix(firstNonEmpty(strings.TrimSpace(req.MimeType), "text/plain"), "text/") || strings.EqualFold(strings.TrimSpace(req.MimeType), "application/json") {
		file.Content = string(req.Content)
	}
	return file, nil
}

func (s *Service) CreateFolder(ctx context.Context, token gmail.TokenEnvelope, req CreateFolderRequest) (File, error) {
	metadata := map[string]any{
		"name":     req.Name,
		"mimeType": folderMimeType,
	}
	if strings.TrimSpace(req.FolderID) != "" {
		metadata["parents"] = []string{req.FolderID}
	}
	raw, err := json.Marshal(metadata)
	if err != nil {
		return File{}, err
	}
	var created driveFilePayload
	createURL, err := appendDriveQuery(apiURL+"/files", func(values url.Values) {
		values.Set("fields", driveFileFields)
		values.Set("supportsAllDrives", "true")
	})
	if err != nil {
		return File{}, err
	}
	if err := s.doJSON(ctx, token, http.MethodPost, createURL, bytes.NewReader(raw), "application/json", &created); err != nil {
		return File{}, err
	}
	return driveFileFromPayload(created), nil
}

func (s *Service) UpdateFile(ctx context.Context, token gmail.TokenEnvelope, fileID string, req UpdateFileRequest) (File, error) {
	fileID = strings.TrimSpace(fileID)
	if fileID == "" {
		return File{}, fmt.Errorf("file id is required")
	}
	hasName := req.Name != nil
	hasContent := req.Content != nil
	hasParent := req.ParentFolderID != nil && strings.TrimSpace(*req.ParentFolderID) != ""
	if !hasName && !hasContent && !hasParent {
		return File{}, fmt.Errorf("at least one Drive file change is required")
	}

	var (
		current driveFilePayload
		err     error
	)
	if hasContent || hasParent {
		current, err = s.getFileMetadata(ctx, token, fileID)
		if err != nil {
			return File{}, err
		}
	}

	endpoint, err := driveFileWriteEndpoint(fileID, current.Parents, req.ParentFolderID)
	if err != nil {
		return File{}, err
	}
	var updated driveFilePayload
	if hasContent {
		if !canUpdateInlineTextContent(current.MimeType) {
			return File{}, fmt.Errorf("Drive file %q does not support inline content updates", current.Name)
		}
		contentType := firstNonEmpty(strings.TrimSpace(current.MimeType), "text/plain")
		body, formType, err := encodeMultipartUpdate(req.Name, req.Content, current.MimeType, contentType)
		if err != nil {
			return File{}, err
		}
		writeURL, err := appendDriveQuery(uploadUpdatePrefix+url.PathEscape(fileID), func(values url.Values) {
			values.Set("uploadType", "multipart")
			values.Set("fields", driveFileFields)
			values.Set("supportsAllDrives", "true")
		})
		if err != nil {
			return File{}, err
		}
		writeURL, err = appendDriveParentMutation(writeURL, current.Parents, req.ParentFolderID)
		if err != nil {
			return File{}, err
		}
		if err := s.doJSON(ctx, token, http.MethodPatch, writeURL, body, formType, &updated); err != nil {
			return File{}, err
		}
		file := driveFileFromPayload(updated)
		file.Content = firstStringValue(req.Content)
		return file, nil
	}

	metadata := map[string]any{}
	if req.Name != nil {
		metadata["name"] = strings.TrimSpace(*req.Name)
	}
	if len(metadata) == 0 && !hasParent {
		return File{}, fmt.Errorf("no Drive file changes were provided")
	}
	raw, err := json.Marshal(metadata)
	if err != nil {
		return File{}, err
	}
	if err := s.doJSON(ctx, token, http.MethodPatch, endpoint, bytes.NewReader(raw), "application/json", &updated); err != nil {
		return File{}, err
	}
	file := driveFileFromPayload(updated)
	s.attachFileContent(ctx, token, &file)
	return file, nil
}

func (s *Service) CopyFile(ctx context.Context, token gmail.TokenEnvelope, fileID string, req CopyFileRequest) (File, error) {
	fileID = strings.TrimSpace(fileID)
	if fileID == "" {
		return File{}, fmt.Errorf("file id is required")
	}
	current, err := s.getFileMetadata(ctx, token, fileID)
	if err != nil {
		return File{}, err
	}
	if current.MimeType == folderMimeType {
		return File{}, fmt.Errorf("folders cannot be copied yet")
	}
	payload := map[string]any{}
	if trimmed := strings.TrimSpace(req.Name); trimmed != "" {
		payload["name"] = trimmed
	}
	if trimmed := strings.TrimSpace(req.FolderID); trimmed != "" {
		payload["parents"] = []string{trimmed}
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return File{}, err
	}
	var copied driveFilePayload
	endpoint, err := appendDriveQuery(apiURL+"/files/"+url.PathEscape(fileID)+"/copy", func(values url.Values) {
		values.Set("fields", driveFileFields)
		values.Set("supportsAllDrives", "true")
	})
	if err != nil {
		return File{}, err
	}
	if err := s.doJSON(ctx, token, http.MethodPost, endpoint, bytes.NewReader(raw), "application/json", &copied); err != nil {
		return File{}, err
	}
	file := driveFileFromPayload(copied)
	s.attachFileContent(ctx, token, &file)
	return file, nil
}

func (s *Service) TrashFile(ctx context.Context, token gmail.TokenEnvelope, fileID string) (File, error) {
	fileID = strings.TrimSpace(fileID)
	if fileID == "" {
		return File{}, fmt.Errorf("file id is required")
	}
	raw := strings.NewReader(`{"trashed":true}`)
	var trashed driveFilePayload
	endpoint, err := appendDriveQuery(apiURL+"/files/"+url.PathEscape(fileID), func(values url.Values) {
		values.Set("fields", driveFileFields)
		values.Set("supportsAllDrives", "true")
	})
	if err != nil {
		return File{}, err
	}
	if err := s.doJSON(ctx, token, http.MethodPatch, endpoint, raw, "application/json", &trashed); err != nil {
		return File{}, err
	}
	file := driveFileFromPayload(trashed)
	s.attachFileContent(ctx, token, &file)
	return file, nil
}

func (s *Service) ListPermissions(ctx context.Context, token gmail.TokenEnvelope, fileID string) ([]Permission, error) {
	fileID = strings.TrimSpace(fileID)
	if fileID == "" {
		return nil, fmt.Errorf("file id is required")
	}
	endpoint, err := appendDriveQuery(apiURL+"/files/"+url.PathEscape(fileID)+"/permissions", func(values url.Values) {
		values.Set("fields", "permissions("+permissionFields+")")
		values.Set("supportsAllDrives", "true")
	})
	if err != nil {
		return nil, err
	}
	var payload struct {
		Permissions []permissionPayload `json:"permissions"`
	}
	if err := s.doJSON(ctx, token, http.MethodGet, endpoint, nil, "", &payload); err != nil {
		return nil, err
	}
	permissions := make([]Permission, 0, len(payload.Permissions))
	for _, item := range payload.Permissions {
		permissions = append(permissions, permissionFromPayload(item))
	}
	return permissions, nil
}

func (s *Service) CreatePermission(ctx context.Context, token gmail.TokenEnvelope, fileID string, req CreatePermissionRequest) (Permission, error) {
	if err := validatePermissionRequest(req.Type, req.Role, req.EmailAddress, req.Domain); err != nil {
		return Permission{}, err
	}
	payload := map[string]any{
		"type": req.Type,
		"role": req.Role,
	}
	if trimmed := strings.TrimSpace(req.EmailAddress); trimmed != "" {
		payload["emailAddress"] = trimmed
	}
	if trimmed := strings.TrimSpace(req.Domain); trimmed != "" {
		payload["domain"] = trimmed
	}
	if req.AllowFileDiscovery != nil {
		payload["allowFileDiscovery"] = *req.AllowFileDiscovery
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return Permission{}, err
	}
	endpoint, err := appendDriveQuery(apiURL+"/files/"+url.PathEscape(strings.TrimSpace(fileID))+"/permissions", func(values url.Values) {
		values.Set("fields", permissionFields)
		values.Set("supportsAllDrives", "true")
		if req.SendNotificationEmail != nil {
			values.Set("sendNotificationEmail", strconv.FormatBool(*req.SendNotificationEmail))
		}
		if trimmed := strings.TrimSpace(req.EmailMessage); trimmed != "" {
			values.Set("emailMessage", trimmed)
		}
	})
	if err != nil {
		return Permission{}, err
	}
	var created permissionPayload
	if err := s.doJSON(ctx, token, http.MethodPost, endpoint, bytes.NewReader(raw), "application/json", &created); err != nil {
		return Permission{}, err
	}
	return permissionFromPayload(created), nil
}

func (s *Service) UpdatePermission(ctx context.Context, token gmail.TokenEnvelope, fileID, permissionID string, req UpdatePermissionRequest) (Permission, error) {
	fileID = strings.TrimSpace(fileID)
	permissionID = strings.TrimSpace(permissionID)
	if fileID == "" || permissionID == "" {
		return Permission{}, fmt.Errorf("file id and permission id are required")
	}
	if req.Role == nil && req.AllowFileDiscovery == nil {
		return Permission{}, fmt.Errorf("at least one Drive permission change is required")
	}
	payload := map[string]any{}
	if req.Role != nil {
		if !isSupportedPermissionRole(*req.Role) {
			return Permission{}, fmt.Errorf("unsupported Drive permission role %q", strings.TrimSpace(*req.Role))
		}
		payload["role"] = strings.TrimSpace(*req.Role)
	}
	if req.AllowFileDiscovery != nil {
		payload["allowFileDiscovery"] = *req.AllowFileDiscovery
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return Permission{}, err
	}
	endpoint, err := appendDriveQuery(apiURL+"/files/"+url.PathEscape(fileID)+"/permissions/"+url.PathEscape(permissionID), func(values url.Values) {
		values.Set("fields", permissionFields)
		values.Set("supportsAllDrives", "true")
	})
	if err != nil {
		return Permission{}, err
	}
	var updated permissionPayload
	if err := s.doJSON(ctx, token, http.MethodPatch, endpoint, bytes.NewReader(raw), "application/json", &updated); err != nil {
		return Permission{}, err
	}
	return permissionFromPayload(updated), nil
}

func (s *Service) DeletePermission(ctx context.Context, token gmail.TokenEnvelope, fileID, permissionID string) error {
	fileID = strings.TrimSpace(fileID)
	permissionID = strings.TrimSpace(permissionID)
	if fileID == "" || permissionID == "" {
		return fmt.Errorf("file id and permission id are required")
	}
	endpoint, err := appendDriveQuery(apiURL+"/files/"+url.PathEscape(fileID)+"/permissions/"+url.PathEscape(permissionID), func(values url.Values) {
		values.Set("supportsAllDrives", "true")
	})
	if err != nil {
		return err
	}
	return s.doJSON(ctx, token, http.MethodDelete, endpoint, nil, "", nil)
}

func (s *Service) downloadText(ctx context.Context, token gmail.TokenEnvelope, fileID, mimeType string) (string, error) {
	var endpoint string
	switch mimeType {
	case "application/vnd.google-apps.document":
		endpoint = apiURL + "/files/" + url.PathEscape(fileID) + "/export?mimeType=text/plain&supportsAllDrives=true"
	case "text/plain", "text/markdown", "application/json":
		endpoint = apiURL + "/files/" + url.PathEscape(fileID) + "?alt=media&supportsAllDrives=true"
	default:
		return "", fmt.Errorf("mime type %q is not supported for inline text download", mimeType)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", firstNonEmpty(token.TokenType, "Bearer")+" "+token.AccessToken)
	response, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode >= 400 {
		return "", fmt.Errorf("google drive download failed: %s", response.Status)
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func (s *Service) getFileMetadata(ctx context.Context, token gmail.TokenEnvelope, fileID string) (driveFilePayload, error) {
	var payload driveFilePayload
	endpoint, err := appendDriveQuery(apiURL+"/files/"+url.PathEscape(strings.TrimSpace(fileID)), func(values url.Values) {
		values.Set("fields", driveFileFields)
		values.Set("supportsAllDrives", "true")
	})
	if err != nil {
		return driveFilePayload{}, err
	}
	if err := s.doJSON(ctx, token, http.MethodGet, endpoint, nil, "", &payload); err != nil {
		return driveFilePayload{}, err
	}
	return payload, nil
}

func (s *Service) attachFileContent(ctx context.Context, token gmail.TokenEnvelope, file *File) {
	if file == nil {
		return
	}
	content, err := s.downloadText(ctx, token, file.ID, file.MimeType)
	if err == nil {
		file.Content = content
	}
}

func (s *Service) doJSON(ctx context.Context, token gmail.TokenEnvelope, method, endpoint string, body io.Reader, contentType string, dest any) error {
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
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
		return fmt.Errorf("google drive api failed: %s", firstNonEmpty(apiErr.Error.Message, response.Status))
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

func parseDriveTime(value string) time.Time {
	if parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(value)); err == nil {
		return parsed.UTC()
	}
	return time.Time{}
}

func parseDriveSize(value string) int64 {
	size, _ := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	return size
}

var (
	driveQueryFieldPattern                = regexp.MustCompile(`(?i)\b(name|fullText|mimeType|modifiedTime|createdTime|viewedByMeTime|starred|trashed|sharedWithMe|parents|owners|writers|readers)\b`)
	driveQueryOperatorPattern             = regexp.MustCompile(`(?i)\b(contains|has|in|and|or|not)\b|!=|>=|<=|=|>|<`)
	driveQueryJoinSuffixPattern           = regexp.MustCompile(`(?i)\b(and|or|not)$`)
	driveQueryInvalidParentLiteralPattern = regexp.MustCompile(`(?i)^'([^']+)'\s+in\s+parents$`)
	driveQueryTrailingOrderByPattern      = regexp.MustCompile(`(?i)\borderBy\s+([A-Za-z][A-Za-z0-9_]*(?:\s+(?:asc|desc))?)\s*$`)
	driveQueryTimeLiteralPattern          = regexp.MustCompile(`(?i)\b(modifiedTime|createdTime|viewedByMeTime)\s*(=|!=|>=|<=|>|<)\s*'([^']+)'`)
	driveQueryTimezonePattern             = regexp.MustCompile(`(?i)(z|[+-]\d{2}:\d{2})$`)
	driveFileIDPattern                    = regexp.MustCompile(`^[A-Za-z0-9_-]{10,}$`)
)

func parseDriveListQuery(query string) (string, string) {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return "", ""
	}
	orderBy := ""
	if matches := driveQueryTrailingOrderByPattern.FindStringSubmatch(trimmed); len(matches) == 2 {
		orderBy = normalizeDriveOrderBy(matches[1])
		trimmed = strings.TrimSpace(trimmed[:len(trimmed)-len(matches[0])])
	}
	return normalizeDriveListQuery(trimmed), orderBy
}

func normalizeDriveListQuery(query string) string {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return ""
	}
	if repaired, ok := repairInvalidParentLiteralQuery(trimmed); ok {
		return repaired
	}
	if looksLikeDriveQuery(trimmed) {
		return normalizeStructuredDriveQuery(trimmed)
	}
	return plainTextDriveSearchQuery(trimmed)
}

func normalizeDriveOrderBy(raw string) string {
	trimmed := strings.ToLower(strings.TrimSpace(raw))
	switch trimmed {
	case "", "relevance":
		return ""
	case "recency":
		return "modifiedTime desc"
	default:
		return trimmed
	}
}

func plainTextDriveSearchQuery(query string) string {
	trimmed := strings.TrimSpace(query)
	terms := strings.Fields(trimmed)
	if len(terms) == 0 {
		return ""
	}
	clauses := make([]string, 0, len(terms)+1)
	for _, term := range terms {
		literal := driveQueryLiteral(term)
		clauses = append(clauses, fmt.Sprintf("(name contains '%s' or fullText contains '%s')", literal, literal))
	}
	clauses = append(clauses, "trashed = false")
	return strings.Join(clauses, " and ")
}

func repairInvalidParentLiteralQuery(query string) (string, bool) {
	matches := driveQueryInvalidParentLiteralPattern.FindStringSubmatch(strings.TrimSpace(query))
	if len(matches) != 2 {
		return "", false
	}
	parentRef := strings.TrimSpace(matches[1])
	if looksLikeDriveFileID(parentRef) {
		return "", false
	}
	return plainTextDriveSearchQuery(parentRef), true
}

func looksLikeDriveFileID(value string) bool {
	return driveFileIDPattern.MatchString(strings.TrimSpace(value))
}

func looksLikeDriveQuery(query string) bool {
	if driveQueryFieldPattern.MatchString(query) && driveQueryOperatorPattern.MatchString(query) {
		return true
	}
	lower := strings.ToLower(strings.TrimSpace(query))
	for _, token := range []string{"trashed = ", "sharedwithme = ", "mimeType = ", "name contains ", "fulltext contains "} {
		if strings.Contains(lower, token) {
			return true
		}
	}
	return false
}

func normalizeStructuredDriveQuery(query string) string {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return ""
	}
	matches := driveQueryFieldPattern.FindAllStringIndex(trimmed, -1)
	if len(matches) < 2 {
		return trimmed
	}
	normalized := trimmed
	inserted := 0
	for index, match := range matches {
		if index == 0 {
			continue
		}
		start := match[0] + inserted
		prefix := strings.TrimRight(normalized[:start], " \t")
		if prefix == "" || strings.HasSuffix(prefix, "(") || driveQueryJoinSuffixPattern.MatchString(prefix) {
			continue
		}
		normalized = normalized[:start] + "and " + normalized[start:]
		inserted += len("and ")
	}
	return normalizeDriveTimeLiterals(normalized)
}

func normalizeDriveTimeLiterals(query string) string {
	return driveQueryTimeLiteralPattern.ReplaceAllStringFunc(query, func(match string) string {
		pieces := driveQueryTimeLiteralPattern.FindStringSubmatch(match)
		if len(pieces) != 4 {
			return match
		}
		literal := strings.TrimSpace(pieces[3])
		if !strings.Contains(literal, "T") || driveQueryTimezonePattern.MatchString(literal) {
			return match
		}
		return fmt.Sprintf("%s %s '%sZ'", pieces[1], pieces[2], literal)
	})
}

func driveQueryLiteral(value string) string {
	escaped := strings.ReplaceAll(value, `\`, `\\`)
	return strings.ReplaceAll(escaped, `'`, `\'`)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func driveFileFromPayload(payload driveFilePayload) File {
	return File{
		ID:          payload.ID,
		Name:        payload.Name,
		MimeType:    payload.MimeType,
		DriveID:     payload.DriveID,
		WebViewLink: payload.WebViewLink,
		ModifiedAt:  parseDriveTime(payload.ModifiedTime),
		Size:        parseDriveSize(payload.Size),
		Parents:     payload.Parents,
		IsFolder:    payload.MimeType == folderMimeType,
		Trashed:     payload.Trashed,
	}
}

func sharedDriveFromPayload(payload sharedDrivePayload) SharedDrive {
	return SharedDrive{
		ID:        payload.ID,
		Name:      payload.Name,
		Hidden:    payload.Hidden,
		CreatedAt: parseDriveTime(payload.CreatedTime),
	}
}

func permissionFromPayload(payload permissionPayload) Permission {
	return Permission{
		ID:                 payload.ID,
		Type:               payload.Type,
		Role:               payload.Role,
		EmailAddress:       payload.EmailAddress,
		Domain:             payload.Domain,
		DisplayName:        payload.DisplayName,
		AllowFileDiscovery: payload.AllowFileDiscovery,
		Deleted:            payload.Deleted,
		PendingOwner:       payload.PendingOwner,
		ExpirationTime:     parseDriveTime(payload.ExpirationTime),
	}
}

func canUpdateInlineTextContent(mimeType string) bool {
	switch strings.TrimSpace(mimeType) {
	case "text/plain", "text/markdown", "application/json":
		return true
	default:
		return false
	}
}

func encodeMultipartUpdate(name, content *string, mimeType, contentType string) (io.Reader, string, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	metaHeader := textproto.MIMEHeader{}
	metaHeader.Set("Content-Type", "application/json; charset=UTF-8")
	metaPart, err := writer.CreatePart(metaHeader)
	if err != nil {
		return nil, "", err
	}
	metadata := map[string]any{}
	if name != nil {
		metadata["name"] = strings.TrimSpace(*name)
	}
	if err := json.NewEncoder(metaPart).Encode(metadata); err != nil {
		return nil, "", err
	}

	contentHeader := textproto.MIMEHeader{}
	contentHeader.Set("Content-Type", firstNonEmpty(strings.TrimSpace(contentType), strings.TrimSpace(mimeType), "text/plain"))
	contentPart, err := writer.CreatePart(contentHeader)
	if err != nil {
		return nil, "", err
	}
	if _, err := io.WriteString(contentPart, firstStringValue(content)); err != nil {
		return nil, "", err
	}
	if err := writer.Close(); err != nil {
		return nil, "", err
	}
	return &body, writer.FormDataContentType(), nil
}

func driveFileWriteEndpoint(fileID string, currentParents []string, parentFolderID *string) (string, error) {
	base, err := appendDriveQuery(apiURL+"/files/"+url.PathEscape(strings.TrimSpace(fileID)), func(values url.Values) {
		values.Set("fields", driveFileFields)
		values.Set("supportsAllDrives", "true")
	})
	if err != nil {
		return "", err
	}
	return appendDriveParentMutation(base, currentParents, parentFolderID)
}

func appendDriveParentMutation(endpoint string, currentParents []string, parentFolderID *string) (string, error) {
	if parentFolderID == nil {
		return endpoint, nil
	}
	targetParent := strings.TrimSpace(*parentFolderID)
	if targetParent == "" {
		return endpoint, nil
	}
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return "", err
	}
	addParent, removeParents := driveParentMutation(currentParents, targetParent)
	values := parsed.Query()
	if addParent != "" {
		values.Set("addParents", addParent)
	}
	if removeParents != "" {
		values.Set("removeParents", removeParents)
	}
	parsed.RawQuery = values.Encode()
	return parsed.String(), nil
}

func driveParentMutation(currentParents []string, targetParent string) (string, string) {
	trimmedTarget := strings.TrimSpace(targetParent)
	if trimmedTarget == "" {
		return "", ""
	}
	remove := make([]string, 0, len(currentParents))
	found := false
	for _, parent := range currentParents {
		trimmed := strings.TrimSpace(parent)
		if trimmed == "" {
			continue
		}
		if trimmed == trimmedTarget {
			found = true
			continue
		}
		remove = append(remove, trimmed)
	}
	if found && len(remove) == 0 {
		return "", ""
	}
	add := trimmedTarget
	if found {
		add = ""
	}
	return add, strings.Join(remove, ",")
}

func firstStringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func appendDriveQuery(endpoint string, update func(url.Values)) (string, error) {
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return "", err
	}
	values := parsed.Query()
	if update != nil {
		update(values)
	}
	parsed.RawQuery = values.Encode()
	return parsed.String(), nil
}

func validatePermissionRequest(permissionType, role, emailAddress, domain string) error {
	permissionType = strings.TrimSpace(permissionType)
	role = strings.TrimSpace(role)
	if permissionType == "" || role == "" {
		return fmt.Errorf("permission type and role are required")
	}
	if !isSupportedPermissionType(permissionType) {
		return fmt.Errorf("unsupported Drive permission type %q", permissionType)
	}
	if !isSupportedPermissionRole(role) {
		return fmt.Errorf("unsupported Drive permission role %q", role)
	}
	switch permissionType {
	case "user", "group":
		if strings.TrimSpace(emailAddress) == "" {
			return fmt.Errorf("email address is required for %s permissions", permissionType)
		}
	case "domain":
		if strings.TrimSpace(domain) == "" {
			return fmt.Errorf("domain is required for domain permissions")
		}
	}
	return nil
}

func isSupportedPermissionType(value string) bool {
	switch strings.TrimSpace(value) {
	case "user", "group", "domain", "anyone":
		return true
	default:
		return false
	}
}

func isSupportedPermissionRole(value string) bool {
	switch strings.TrimSpace(value) {
	case "reader", "commenter", "writer", "fileOrganizer", "organizer":
		return true
	default:
		return false
	}
}
