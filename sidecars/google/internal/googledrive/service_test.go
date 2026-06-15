package googledrive

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/ambient-xyz/AmbientDesktop/sidecars/google/internal/gmail"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func TestUpdateFileRenamesAndMovesFolder(t *testing.T) {
	name := "Archive 2026"
	parentID := "folder-archive"
	call := 0
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				call++
				switch call {
				case 1:
					if req.Method != http.MethodGet {
						t.Fatalf("expected GET metadata call, got %s", req.Method)
					}
					if req.URL.Path != "/drive/v3/files/folder-1" {
						t.Fatalf("unexpected metadata path %s", req.URL.Path)
					}
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body: io.NopCloser(strings.NewReader(`{
							"id":"folder-1",
							"name":"Ops Folder",
							"mimeType":"application/vnd.google-apps.folder",
							"parents":["folder-live"]
						}`)),
					}, nil
				case 2:
					if req.Method != http.MethodPatch {
						t.Fatalf("expected PATCH update call, got %s", req.Method)
					}
					if req.URL.Path != "/drive/v3/files/folder-1" {
						t.Fatalf("unexpected update path %s", req.URL.Path)
					}
					if req.URL.Query().Get("addParents") != "folder-archive" {
						t.Fatalf("expected addParents query, got %q", req.URL.RawQuery)
					}
					if req.URL.Query().Get("removeParents") != "folder-live" {
						t.Fatalf("expected removeParents query, got %q", req.URL.RawQuery)
					}
					body, err := io.ReadAll(req.Body)
					if err != nil {
						t.Fatalf("read request body: %v", err)
					}
					var payload map[string]any
					if err := json.Unmarshal(body, &payload); err != nil {
						t.Fatalf("decode request body: %v", err)
					}
					if payload["name"] != "Archive 2026" {
						t.Fatalf("expected renamed folder payload, got %#v", payload)
					}
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body: io.NopCloser(strings.NewReader(`{
							"id":"folder-1",
							"name":"Archive 2026",
							"mimeType":"application/vnd.google-apps.folder",
							"parents":["folder-archive"]
						}`)),
					}, nil
				default:
					t.Fatalf("unexpected request %d: %s %s", call, req.Method, req.URL.String())
					return nil, nil
				}
			}),
		},
	}

	file, err := service.UpdateFile(context.Background(), gmail.TokenEnvelope{AccessToken: "token-1"}, "folder-1", UpdateFileRequest{
		Name:           &name,
		ParentFolderID: &parentID,
	})
	if err != nil {
		t.Fatalf("UpdateFile returned error: %v", err)
	}
	if file.Name != "Archive 2026" || !file.IsFolder || len(file.Parents) != 1 || file.Parents[0] != "folder-archive" {
		t.Fatalf("unexpected updated folder: %#v", file)
	}
}

func TestCreateFileUploadsBinaryContent(t *testing.T) {
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.Method != http.MethodPost {
					t.Fatalf("expected POST upload call, got %s", req.Method)
				}
				if req.URL.Host != "www.googleapis.com" || req.URL.Path != "/upload/drive/v3/files" {
					t.Fatalf("unexpected upload endpoint %s", req.URL.String())
				}
				if req.URL.Query().Get("uploadType") != "multipart" {
					t.Fatalf("expected multipart upload, got %q", req.URL.RawQuery)
				}
				body, err := io.ReadAll(req.Body)
				if err != nil {
					t.Fatalf("read upload body: %v", err)
				}
				raw := string(body)
				for _, snippet := range []string{`"name":"report.pdf"`, `"mimeType":"application/pdf"`, "Content-Type: application/pdf", "pdf-bytes"} {
					if !strings.Contains(raw, snippet) {
						t.Fatalf("expected multipart body to contain %q, got %q", snippet, raw)
					}
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body: io.NopCloser(strings.NewReader(`{
						"id":"file-uploaded",
						"name":"report.pdf",
						"mimeType":"application/pdf",
						"parents":["folder-1"]
					}`)),
				}, nil
			}),
		},
	}

	file, err := service.CreateFile(context.Background(), gmail.TokenEnvelope{AccessToken: "token-upload"}, CreateFileRequest{
		Name:     "report.pdf",
		MimeType: "application/pdf",
		Content:  []byte("pdf-bytes"),
		FolderID: "folder-1",
	})
	if err != nil {
		t.Fatalf("CreateFile returned error: %v", err)
	}
	if file.ID != "file-uploaded" || file.Name != "report.pdf" || file.MimeType != "application/pdf" {
		t.Fatalf("unexpected uploaded file: %#v", file)
	}
}

func TestUpdateFileUsesMultipartForContentChanges(t *testing.T) {
	name := "notes.txt"
	content := "Updated notes body"
	call := 0
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				call++
				switch call {
				case 1:
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body: io.NopCloser(strings.NewReader(`{
							"id":"doc-1",
							"name":"notes.txt",
							"mimeType":"text/plain",
							"parents":["folder-live"]
						}`)),
					}, nil
				case 2:
					if req.Method != http.MethodPatch {
						t.Fatalf("expected PATCH upload call, got %s", req.Method)
					}
					if req.URL.Host != "www.googleapis.com" || req.URL.Path != "/upload/drive/v3/files/doc-1" {
						t.Fatalf("unexpected upload endpoint %s", req.URL.String())
					}
					if req.URL.Query().Get("uploadType") != "multipart" {
						t.Fatalf("expected multipart upload, got %q", req.URL.RawQuery)
					}
					if got := req.Header.Get("Content-Type"); !strings.Contains(got, "multipart/form-data") {
						t.Fatalf("expected multipart content type, got %q", got)
					}
					body, err := io.ReadAll(req.Body)
					if err != nil {
						t.Fatalf("read upload body: %v", err)
					}
					raw := string(body)
					for _, snippet := range []string{`"name":"notes.txt"`, "Updated notes body", "Content-Type: text/plain"} {
						if !strings.Contains(raw, snippet) {
							t.Fatalf("expected multipart body to contain %q, got %q", snippet, raw)
						}
					}
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body: io.NopCloser(strings.NewReader(`{
							"id":"doc-1",
							"name":"notes.txt",
							"mimeType":"text/plain",
							"parents":["folder-live"]
						}`)),
					}, nil
				default:
					t.Fatalf("unexpected request %d: %s %s", call, req.Method, req.URL.String())
					return nil, nil
				}
			}),
		},
	}

	file, err := service.UpdateFile(context.Background(), gmail.TokenEnvelope{AccessToken: "token-2"}, "doc-1", UpdateFileRequest{
		Name:    &name,
		Content: &content,
	})
	if err != nil {
		t.Fatalf("UpdateFile returned error: %v", err)
	}
	if file.Content != "Updated notes body" || file.Name != "notes.txt" {
		t.Fatalf("unexpected updated file: %#v", file)
	}
}

func TestCopyFilePostsTargetFolderPayload(t *testing.T) {
	call := 0
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				call++
				switch call {
				case 1:
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body: io.NopCloser(strings.NewReader(`{
							"id":"doc-1",
							"name":"Quarterly notes",
							"mimeType":"application/pdf",
							"parents":["ops-folder"]
						}`)),
					}, nil
				case 2:
					if req.Method != http.MethodPost {
						t.Fatalf("expected POST copy call, got %s", req.Method)
					}
					if req.URL.Path != "/drive/v3/files/doc-1/copy" {
						t.Fatalf("unexpected copy path %s", req.URL.Path)
					}
					body, err := io.ReadAll(req.Body)
					if err != nil {
						t.Fatalf("read copy body: %v", err)
					}
					var payload map[string]any
					if err := json.Unmarshal(body, &payload); err != nil {
						t.Fatalf("decode copy body: %v", err)
					}
					if payload["name"] != "Quarterly notes backup" {
						t.Fatalf("expected copied name, got %#v", payload)
					}
					parents := payload["parents"].([]any)
					if len(parents) != 1 || parents[0] != "backup-folder" {
						t.Fatalf("expected target folder, got %#v", parents)
					}
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body: io.NopCloser(strings.NewReader(`{
							"id":"copy-1",
							"name":"Quarterly notes backup",
							"mimeType":"application/pdf",
							"parents":["backup-folder"]
						}`)),
					}, nil
				default:
					t.Fatalf("unexpected request %d: %s %s", call, req.Method, req.URL.String())
					return nil, nil
				}
			}),
		},
	}

	file, err := service.CopyFile(context.Background(), gmail.TokenEnvelope{AccessToken: "token-3"}, "doc-1", CopyFileRequest{
		Name:     "Quarterly notes backup",
		FolderID: "backup-folder",
	})
	if err != nil {
		t.Fatalf("CopyFile returned error: %v", err)
	}
	if file.ID != "copy-1" || file.Name != "Quarterly notes backup" {
		t.Fatalf("unexpected copied file: %#v", file)
	}
}

func TestTrashFilePatchesTrashedTrue(t *testing.T) {
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.Method != http.MethodPatch {
					t.Fatalf("expected PATCH trash call, got %s", req.Method)
				}
				if req.URL.Path != "/drive/v3/files/doc-1" {
					t.Fatalf("unexpected trash path %s", req.URL.Path)
				}
				body, err := io.ReadAll(req.Body)
				if err != nil {
					t.Fatalf("read trash body: %v", err)
				}
				if strings.TrimSpace(string(body)) != `{"trashed":true}` {
					t.Fatalf("expected trash payload, got %q", string(body))
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body: io.NopCloser(strings.NewReader(`{
						"id":"doc-1",
						"name":"Quarterly notes",
						"mimeType":"application/pdf",
						"trashed":true
					}`)),
				}, nil
			}),
		},
	}

	file, err := service.TrashFile(context.Background(), gmail.TokenEnvelope{AccessToken: "token-4"}, "doc-1")
	if err != nil {
		t.Fatalf("TrashFile returned error: %v", err)
	}
	if !file.Trashed || file.ID != "doc-1" {
		t.Fatalf("unexpected trashed file: %#v", file)
	}
}

func TestListFilesSupportsSharedDrives(t *testing.T) {
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.Method != http.MethodGet {
					t.Fatalf("expected GET list call, got %s", req.Method)
				}
				if req.URL.Path != "/drive/v3/files" {
					t.Fatalf("unexpected list path %s", req.URL.Path)
				}
				if req.URL.Query().Get("supportsAllDrives") != "true" {
					t.Fatalf("expected supportsAllDrives, got %q", req.URL.RawQuery)
				}
				if req.URL.Query().Get("includeItemsFromAllDrives") != "true" {
					t.Fatalf("expected includeItemsFromAllDrives, got %q", req.URL.RawQuery)
				}
				if req.URL.Query().Get("corpora") != "drive" || req.URL.Query().Get("driveId") != "shared-ops" {
					t.Fatalf("expected shared drive scope, got %q", req.URL.RawQuery)
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body: io.NopCloser(strings.NewReader(`{
						"files":[{
							"id":"doc-1",
							"name":"Ops notes",
							"mimeType":"text/plain",
							"driveId":"shared-ops",
							"parents":["folder-1"]
						}]
					}`)),
				}, nil
			}),
		},
	}

	files, err := service.ListFiles(context.Background(), gmail.TokenEnvelope{AccessToken: "token-shared"}, ListFilesOptions{
		Query:         "trashed = false",
		PageSize:      25,
		SharedDriveID: "shared-ops",
	})
	if err != nil {
		t.Fatalf("ListFiles returned error: %v", err)
	}
	if len(files) != 1 || files[0].DriveID != "shared-ops" {
		t.Fatalf("unexpected files: %#v", files)
	}
}

func TestListFilesExtractsTrailingOrderByFromQuery(t *testing.T) {
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.Method != http.MethodGet {
					t.Fatalf("expected GET list call, got %s", req.Method)
				}
				if req.URL.Path != "/drive/v3/files" {
					t.Fatalf("unexpected list path %s", req.URL.Path)
				}
				if got := req.URL.Query().Get("q"); got != "modifiedTime > '2026-04-01'" {
					t.Fatalf("expected cleaned Drive query, got %q", got)
				}
				if got := req.URL.Query().Get("orderBy"); got != "modifiedTime desc" {
					t.Fatalf("expected mapped orderBy, got %q", got)
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body:       io.NopCloser(strings.NewReader(`{"files":[]}`)),
				}, nil
			}),
		},
	}

	if _, err := service.ListFiles(context.Background(), gmail.TokenEnvelope{AccessToken: "token-order"}, ListFilesOptions{
		Query:    "modifiedTime > '2026-04-01' orderBy recency",
		PageSize: 15,
	}); err != nil {
		t.Fatalf("ListFiles returned error: %v", err)
	}
}

func TestListSharedDrivesReturnsMetadata(t *testing.T) {
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.Method != http.MethodGet || req.URL.Path != "/drive/v3/drives" {
					t.Fatalf("unexpected shared drives request: %s %s", req.Method, req.URL.String())
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body: io.NopCloser(strings.NewReader(`{
						"drives":[{"id":"shared-ops","name":"Shared Ops","hidden":false,"createdTime":"2026-03-20T16:00:00Z"}]
					}`)),
				}, nil
			}),
		},
	}

	drives, err := service.ListSharedDrives(context.Background(), gmail.TokenEnvelope{AccessToken: "token-drives"}, 10)
	if err != nil {
		t.Fatalf("ListSharedDrives returned error: %v", err)
	}
	if len(drives) != 1 || drives[0].ID != "shared-ops" || drives[0].Name != "Shared Ops" {
		t.Fatalf("unexpected shared drives: %#v", drives)
	}
}

func TestPermissionsLifecycleUsesExpectedEndpoints(t *testing.T) {
	call := 0
	role := "writer"
	allowDiscovery := false
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				call++
				switch call {
				case 1:
					if req.Method != http.MethodGet || req.URL.Path != "/drive/v3/files/doc-1/permissions" {
						t.Fatalf("unexpected permissions list request: %s %s", req.Method, req.URL.String())
					}
					if req.URL.Query().Get("supportsAllDrives") != "true" {
						t.Fatalf("expected supportsAllDrives on list, got %q", req.URL.RawQuery)
					}
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body: io.NopCloser(strings.NewReader(`{
							"permissions":[{"id":"perm-1","type":"user","role":"reader","emailAddress":"neo@example.com"}]
						}`)),
					}, nil
				case 2:
					if req.Method != http.MethodPost || req.URL.Path != "/drive/v3/files/doc-1/permissions" {
						t.Fatalf("unexpected permissions create request: %s %s", req.Method, req.URL.String())
					}
					if req.URL.Query().Get("sendNotificationEmail") != "false" {
						t.Fatalf("expected sendNotificationEmail=false, got %q", req.URL.RawQuery)
					}
					body, err := io.ReadAll(req.Body)
					if err != nil {
						t.Fatalf("read create permission body: %v", err)
					}
					var payload map[string]any
					if err := json.Unmarshal(body, &payload); err != nil {
						t.Fatalf("decode create permission body: %v", err)
					}
					if payload["type"] != "user" || payload["role"] != "writer" || payload["emailAddress"] != "owner@example.com" {
						t.Fatalf("unexpected create permission payload: %#v", payload)
					}
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body: io.NopCloser(strings.NewReader(`{
							"id":"perm-2","type":"user","role":"writer","emailAddress":"owner@example.com"
						}`)),
					}, nil
				case 3:
					if req.Method != http.MethodPatch || req.URL.Path != "/drive/v3/files/doc-1/permissions/perm-2" {
						t.Fatalf("unexpected permissions update request: %s %s", req.Method, req.URL.String())
					}
					body, err := io.ReadAll(req.Body)
					if err != nil {
						t.Fatalf("read update permission body: %v", err)
					}
					var payload map[string]any
					if err := json.Unmarshal(body, &payload); err != nil {
						t.Fatalf("decode update permission body: %v", err)
					}
					if payload["role"] != "writer" || payload["allowFileDiscovery"] != false {
						t.Fatalf("unexpected update permission payload: %#v", payload)
					}
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body: io.NopCloser(strings.NewReader(`{
							"id":"perm-2","type":"user","role":"writer","emailAddress":"owner@example.com","allowFileDiscovery":false
						}`)),
					}, nil
				case 4:
					if req.Method != http.MethodDelete || req.URL.Path != "/drive/v3/files/doc-1/permissions/perm-2" {
						t.Fatalf("unexpected permissions delete request: %s %s", req.Method, req.URL.String())
					}
					if req.URL.Query().Get("supportsAllDrives") != "true" {
						t.Fatalf("expected supportsAllDrives on delete, got %q", req.URL.RawQuery)
					}
					return &http.Response{
						StatusCode: http.StatusNoContent,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body:       io.NopCloser(strings.NewReader("")),
					}, nil
				default:
					t.Fatalf("unexpected request %d: %s %s", call, req.Method, req.URL.String())
					return nil, nil
				}
			}),
		},
	}

	permissions, err := service.ListPermissions(context.Background(), gmail.TokenEnvelope{AccessToken: "token-perms"}, "doc-1")
	if err != nil {
		t.Fatalf("ListPermissions returned error: %v", err)
	}
	if len(permissions) != 1 || permissions[0].ID != "perm-1" {
		t.Fatalf("unexpected permissions: %#v", permissions)
	}

	created, err := service.CreatePermission(context.Background(), gmail.TokenEnvelope{AccessToken: "token-perms"}, "doc-1", CreatePermissionRequest{
		Type:                  "user",
		Role:                  "writer",
		EmailAddress:          "owner@example.com",
		SendNotificationEmail: &allowDiscovery,
	})
	if err != nil {
		t.Fatalf("CreatePermission returned error: %v", err)
	}
	if created.ID != "perm-2" || created.EmailAddress != "owner@example.com" {
		t.Fatalf("unexpected created permission: %#v", created)
	}

	updated, err := service.UpdatePermission(context.Background(), gmail.TokenEnvelope{AccessToken: "token-perms"}, "doc-1", "perm-2", UpdatePermissionRequest{
		Role:               &role,
		AllowFileDiscovery: &allowDiscovery,
	})
	if err != nil {
		t.Fatalf("UpdatePermission returned error: %v", err)
	}
	if updated.Role != "writer" || updated.AllowFileDiscovery {
		t.Fatalf("unexpected updated permission: %#v", updated)
	}

	if err := service.DeletePermission(context.Background(), gmail.TokenEnvelope{AccessToken: "token-perms"}, "doc-1", "perm-2"); err != nil {
		t.Fatalf("DeletePermission returned error: %v", err)
	}
}

func TestNormalizeDriveListQueryTreatsPlainTextAsTermSearch(t *testing.T) {
	got := normalizeDriveListQuery("Ambient Agent")
	want := "(name contains 'Ambient' or fullText contains 'Ambient') and (name contains 'Agent' or fullText contains 'Agent') and trashed = false"
	if got != want {
		t.Fatalf("expected plain text query to be expanded, got %q", got)
	}
}

func TestNormalizeDriveListQueryPreservesDriveQuerySyntax(t *testing.T) {
	raw := "modifiedTime > '2026-01-01T00:00:00Z' and name contains 'roadmap'"
	if got := normalizeDriveListQuery(raw); got != raw {
		t.Fatalf("expected raw drive query to round-trip, got %q", got)
	}
}

func TestNormalizeDriveListQueryRepairsMissingBooleanJoin(t *testing.T) {
	raw := "name contains 'Ambient Agent' modifiedTime > '2026-03-01'"
	want := "name contains 'Ambient Agent' and modifiedTime > '2026-03-01'"
	if got := normalizeDriveListQuery(raw); got != want {
		t.Fatalf("expected malformed drive query to be repaired, got %q", got)
	}
}

func TestNormalizeDriveListQueryNormalizesTimezoneLessDriveTimestamps(t *testing.T) {
	raw := "modifiedTime > '2026-04-03T10:00:00' and name contains 'brief'"
	want := "modifiedTime > '2026-04-03T10:00:00Z' and name contains 'brief'"
	if got := normalizeDriveListQuery(raw); got != want {
		t.Fatalf("expected timestamp literal to gain UTC timezone, got %q", got)
	}
}

func TestNormalizeDriveListQueryEscapesLiteralTerms(t *testing.T) {
	got := normalizeDriveListQuery("founder's notes")
	want := "(name contains 'founder\\'s' or fullText contains 'founder\\'s') and (name contains 'notes' or fullText contains 'notes') and trashed = false"
	if got != want {
		t.Fatalf("expected apostrophes to be escaped, got %q", got)
	}
}

func TestNormalizeDriveListQueryDoesNotMisclassifyPlainEnglishConjunctions(t *testing.T) {
	got := normalizeDriveListQuery("sales and marketing")
	want := "(name contains 'sales' or fullText contains 'sales') and (name contains 'and' or fullText contains 'and') and (name contains 'marketing' or fullText contains 'marketing') and trashed = false"
	if got != want {
		t.Fatalf("expected plain english conjunction to stay a plain-text search, got %q", got)
	}
}

func TestNormalizeDriveListQueryRepairsInvalidParentLiteralReference(t *testing.T) {
	got := normalizeDriveListQuery("'Ambient Agent' in parents")
	want := "(name contains 'Ambient' or fullText contains 'Ambient') and (name contains 'Agent' or fullText contains 'Agent') and trashed = false"
	if got != want {
		t.Fatalf("expected invalid parent literal to degrade to plain-text search, got %q", got)
	}
}

func TestNormalizeDriveListQueryPreservesParentFileIDReference(t *testing.T) {
	raw := "'1Krox6KnmiOKCag3Mvh5JvyFjwRhuYqK4' in parents"
	if got := normalizeDriveListQuery(raw); got != raw {
		t.Fatalf("expected parent file-id query to round-trip, got %q", got)
	}
}

func TestParseDriveListQuerySplitsTrailingOrderByClause(t *testing.T) {
	query, orderBy := parseDriveListQuery("modifiedTime > '2026-04-01' orderBy recency")
	if query != "modifiedTime > '2026-04-01'" {
		t.Fatalf("expected cleaned query, got %q", query)
	}
	if orderBy != "modifiedTime desc" {
		t.Fatalf("expected recency orderBy mapping, got %q", orderBy)
	}
}
