package gmail

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"slices"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func TestGetThreadFallsBackFromMessageID(t *testing.T) {
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				switch {
				case req.Method == http.MethodGet && strings.Contains(req.URL.Path, "/users/me/threads/msg_123"):
					return jsonResponse(http.StatusNotFound, `{"error":{"message":"Requested entity was not found."}}`), nil
				case req.Method == http.MethodGet && strings.Contains(req.URL.Path, "/users/me/messages/msg_123"):
					return jsonResponse(http.StatusOK, `{"id":"msg_123","threadId":"thread_456","labelIds":["INBOX"],"snippet":"hello","internalDate":"1711958400000","payload":{"headers":[{"name":"From","value":"alice@example.com"},{"name":"To","value":"bob@example.com"},{"name":"Subject","value":"Hi"},{"name":"Date","value":"Mon, 01 Apr 2026 09:00:00 -0700"}]}}`), nil
				case req.Method == http.MethodGet && strings.Contains(req.URL.Path, "/users/me/threads/thread_456"):
					return jsonResponse(http.StatusOK, `{"id":"thread_456","historyId":"1","snippet":"hello","messages":[{"id":"msg_123","threadId":"thread_456","labelIds":["INBOX"],"snippet":"hello","internalDate":"1711958400000","payload":{"mimeType":"text/plain","headers":[{"name":"From","value":"alice@example.com"},{"name":"To","value":"bob@example.com"},{"name":"Subject","value":"Hi"},{"name":"Date","value":"Mon, 01 Apr 2026 09:00:00 -0700"}],"body":{"data":"aGVsbG8="}}}]}`), nil
				default:
					t.Fatalf("unexpected request: %s %s", req.Method, req.URL.String())
					return nil, nil
				}
			}),
		},
	}

	thread, err := service.GetThread(context.Background(), TokenEnvelope{AccessToken: "token", TokenType: "Bearer"}, "msg_123", GetThreadOptions{})
	if err != nil {
		t.Fatalf("GetThread returned error: %v", err)
	}
	if thread.ID != "thread_456" {
		t.Fatalf("expected fallback thread id, got %#v", thread)
	}
	if len(thread.Messages) != 1 || thread.Messages[0].ID != "msg_123" {
		t.Fatalf("expected thread messages to load after fallback, got %#v", thread.Messages)
	}
}

func TestModifyMessagesResolvesLabelNamesAndGroupsPerMessageOperations(t *testing.T) {
	var batchBodies []map[string]any
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				switch {
				case req.Method == http.MethodGet && req.URL.String() == apiURL+"/users/me/labels":
					return jsonResponse(http.StatusOK, `{"labels":[{"id":"Label_9","name":"Newsletters"},{"id":"Label_16","name":"Other"}]}`), nil
				case req.Method == http.MethodPost && req.URL.String() == apiURL+"/users/me/messages/batchModify":
					body, err := io.ReadAll(req.Body)
					if err != nil {
						t.Fatalf("read request body: %v", err)
					}
					var payload map[string]any
					if err := json.Unmarshal(body, &payload); err != nil {
						t.Fatalf("decode request body: %v", err)
					}
					batchBodies = append(batchBodies, payload)
					return jsonResponse(http.StatusOK, `{}`), nil
				default:
					t.Fatalf("unexpected request: %s %s", req.Method, req.URL.String())
					return nil, nil
				}
			}),
		},
	}

	result, err := service.ModifyMessages(context.Background(), TokenEnvelope{AccessToken: "token", TokenType: "Bearer"}, ModifyMessagesRequest{
		Operations: []ModifyMessageOperation{
			{ID: "msg-1", AddLabels: []string{"Newsletters"}},
			{ID: "msg-2", AddLabels: []string{"Newsletters"}},
			{ID: "msg-3", AddLabels: []string{"Other"}},
		},
	})
	if err != nil {
		t.Fatalf("ModifyMessages returned error: %v", err)
	}
	if result.UpdatedCount != 3 {
		t.Fatalf("expected 3 updated messages, got %#v", result)
	}
	if len(batchBodies) != 2 {
		t.Fatalf("expected 2 grouped batch modify requests, got %#v", batchBodies)
	}
	var sawNewsletters, sawOther bool
	for _, body := range batchBodies {
		ids, _ := body["ids"].([]any)
		addLabelIDs, _ := body["addLabelIds"].([]any)
		gotIDs := make([]string, 0, len(ids))
		for _, id := range ids {
			gotIDs = append(gotIDs, strings.TrimSpace(id.(string)))
		}
		gotLabels := make([]string, 0, len(addLabelIDs))
		for _, labelID := range addLabelIDs {
			gotLabels = append(gotLabels, strings.TrimSpace(labelID.(string)))
		}
		slices.Sort(gotIDs)
		slices.Sort(gotLabels)
		switch {
		case slices.Equal(gotIDs, []string{"msg-1", "msg-2"}) && slices.Equal(gotLabels, []string{"Label_9"}):
			sawNewsletters = true
		case slices.Equal(gotIDs, []string{"msg-3"}) && slices.Equal(gotLabels, []string{"Label_16"}):
			sawOther = true
		default:
			t.Fatalf("unexpected batch modify body %#v", body)
		}
	}
	if !sawNewsletters || !sawOther {
		t.Fatalf("expected both grouped mutations, got %#v", batchBodies)
	}
}

func TestModifyMessagesReturnsErrorWhenNamedLabelIsMissing(t *testing.T) {
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.Method == http.MethodGet && req.URL.String() == apiURL+"/users/me/labels" {
					return jsonResponse(http.StatusOK, `{"labels":[{"id":"Label_9","name":"Newsletters"}]}`), nil
				}
				t.Fatalf("unexpected request: %s %s", req.Method, req.URL.String())
				return nil, nil
			}),
		},
	}

	_, err := service.ModifyMessages(context.Background(), TokenEnvelope{AccessToken: "token", TokenType: "Bearer"}, ModifyMessagesRequest{
		Operations: []ModifyMessageOperation{{ID: "msg-1", AddLabels: []string{"Missing"}}},
	})
	if err == nil || !strings.Contains(err.Error(), `label "Missing" not found`) {
		t.Fatalf("expected missing label error, got %v", err)
	}
}

func jsonResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func TestCreateDraftIncludesMultipartAttachments(t *testing.T) {
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				body, err := io.ReadAll(req.Body)
				if err != nil {
					t.Fatalf("read request body: %v", err)
				}
				var payload struct {
					Message struct {
						Raw string `json:"raw"`
					} `json:"message"`
				}
				if err := json.Unmarshal(body, &payload); err != nil {
					t.Fatalf("decode request body: %v", err)
				}
				rawBytes, err := base64.RawURLEncoding.DecodeString(payload.Message.Raw)
				if err != nil {
					t.Fatalf("decode raw message: %v", err)
				}
				raw := string(rawBytes)
				for _, snippet := range []string{"multipart/mixed", `filename="notes.txt"`, "Content-Transfer-Encoding: base64", "aGVsbG8gd29ybGQ="} {
					if !strings.Contains(raw, snippet) {
						t.Fatalf("expected raw message to contain %q, got %q", snippet, raw)
					}
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body:       io.NopCloser(strings.NewReader(`{"id":"draft-3","message":{"id":"msg-3"}}`)),
				}, nil
			}),
		},
	}

	result, err := service.CreateDraft(context.Background(), TokenEnvelope{AccessToken: "token-3"}, DraftRequest{
		To:      []string{"person@example.com"},
		Subject: "Attachment draft",
		Body:    "Draft body",
		Attachments: []OutboundAttachment{
			{Filename: "notes.txt", MimeType: "text/plain", Data: []byte("hello world")},
		},
	})
	if err != nil {
		t.Fatalf("CreateDraft returned error: %v", err)
	}
	if result.ID != "draft-3" || result.MessageID != "msg-3" {
		t.Fatalf("unexpected draft result: %#v", result)
	}
}

func TestGetDraftIncludesAttachmentSummaries(t *testing.T) {
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body: io.NopCloser(strings.NewReader(`{
						"id":"draft-1",
						"message":{
							"id":"msg-1",
							"threadId":"thread-1",
							"snippet":"Preview",
							"payload":{
								"mimeType":"multipart/mixed",
								"headers":[
									{"name":"To","value":"person@example.com"},
									{"name":"Subject","value":"Draft with attachment"}
								],
								"parts":[
									{
										"mimeType":"text/plain",
										"body":{"data":"` + base64.RawURLEncoding.EncodeToString([]byte("Body")) + `"}
									},
									{
										"mimeType":"text/plain",
										"filename":"notes.txt",
										"body":{"attachmentId":"att-1","size":11}
									}
								]
							}
						}
					}`)),
				}, nil
			}),
		},
	}

	draft, err := service.GetDraft(context.Background(), TokenEnvelope{AccessToken: "token-4"}, "draft-1")
	if err != nil {
		t.Fatalf("GetDraft returned error: %v", err)
	}
	if len(draft.Attachments) != 1 {
		t.Fatalf("expected one draft attachment, got %#v", draft.Attachments)
	}
	if draft.Attachments[0].ID != "att-1" || draft.Attachments[0].Filename != "notes.txt" {
		t.Fatalf("unexpected draft attachment %#v", draft.Attachments[0])
	}
}

func TestListDraftsHydratesDraftSummaries(t *testing.T) {
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				switch req.URL.String() {
				case apiURL + "/users/me/drafts?maxResults=10":
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body: io.NopCloser(strings.NewReader(`{
							"drafts":[{"id":"draft-1"},{"id":"draft-2"}],
							"nextPageToken":"page-2",
							"resultSizeEstimate":2
						}`)),
					}, nil
				case apiURL + "/users/me/drafts/draft-1?format=full":
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body: io.NopCloser(strings.NewReader(`{
							"id":"draft-1",
							"message":{
								"id":"msg-1",
								"threadId":"thread-1",
								"snippet":"Preview 1",
								"internalDate":"1741777200000",
								"payload":{
									"mimeType":"text/plain",
									"headers":[
										{"name":"To","value":"person@example.com"},
										{"name":"Subject","value":"First draft"}
									],
									"body":{"data":"` + base64.RawURLEncoding.EncodeToString([]byte("Body 1")) + `"}
								}
							}
						}`)),
					}, nil
				case apiURL + "/users/me/drafts/draft-2?format=full":
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body: io.NopCloser(strings.NewReader(`{
							"id":"draft-2",
							"message":{
								"id":"msg-2",
								"threadId":"thread-2",
								"snippet":"Preview 2",
								"internalDate":"1741863600000",
								"payload":{
									"mimeType":"text/plain",
									"headers":[
										{"name":"To","value":"person@example.com"},
										{"name":"Subject","value":"Second draft"}
									],
									"body":{"data":"` + base64.RawURLEncoding.EncodeToString([]byte("Body 2")) + `"}
								}
							}
						}`)),
					}, nil
				default:
					t.Fatalf("unexpected URL %s", req.URL.String())
					return nil, nil
				}
			}),
		},
	}

	result, err := service.ListDrafts(context.Background(), TokenEnvelope{AccessToken: "draft-list-token"}, ListDraftsOptions{})
	if err != nil {
		t.Fatalf("ListDrafts returned error: %v", err)
	}
	if result.NextPageToken != "page-2" || result.ResultSizeEstimate != 2 {
		t.Fatalf("unexpected pagination data %#v", result)
	}
	if len(result.Drafts) != 2 {
		t.Fatalf("expected two drafts, got %#v", result.Drafts)
	}
	if result.Drafts[0].ID != "draft-2" || result.Drafts[0].Subject != "Second draft" {
		t.Fatalf("expected newest draft first, got %#v", result.Drafts)
	}
}

func TestUpdateDraftUsesPutResourceShape(t *testing.T) {
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.Method != http.MethodPut {
					t.Fatalf("expected PUT, got %s", req.Method)
				}
				if req.URL.String() != apiURL+"/users/me/drafts/draft-1" {
					t.Fatalf("unexpected URL %s", req.URL.String())
				}
				body, err := io.ReadAll(req.Body)
				if err != nil {
					t.Fatalf("read request body: %v", err)
				}
				var payload struct {
					ID      string `json:"id"`
					Message struct {
						Raw      string `json:"raw"`
						ThreadID string `json:"threadId"`
					} `json:"message"`
				}
				if err := json.Unmarshal(body, &payload); err != nil {
					t.Fatalf("decode request body: %v", err)
				}
				if payload.ID != "draft-1" || payload.Message.ThreadID != "thread-123" {
					t.Fatalf("unexpected draft update payload %#v", payload)
				}
				rawBytes, err := base64.RawURLEncoding.DecodeString(payload.Message.Raw)
				if err != nil {
					t.Fatalf("decode raw message: %v", err)
				}
				if !strings.Contains(string(rawBytes), "Subject: Updated subject\r\n") {
					t.Fatalf("expected updated subject in raw message, got %q", string(rawBytes))
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body:       io.NopCloser(strings.NewReader(`{"id":"draft-1","message":{"id":"msg-1","threadId":"thread-123"}}`)),
				}, nil
			}),
		},
	}

	result, err := service.UpdateDraft(context.Background(), TokenEnvelope{AccessToken: "token-1"}, "draft-1", DraftRequest{
		To:       []string{"person@example.com"},
		Subject:  "Updated subject",
		Body:     "Updated body",
		ThreadID: "thread-123",
	})
	if err != nil {
		t.Fatalf("UpdateDraft returned error: %v", err)
	}
	if result.ID != "draft-1" || result.ThreadID != "thread-123" {
		t.Fatalf("unexpected draft result %#v", result)
	}
}

func TestSendDraftPostsDraftID(t *testing.T) {
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.Method != http.MethodPost {
					t.Fatalf("expected POST, got %s", req.Method)
				}
				if req.URL.String() != apiURL+"/users/me/drafts/send" {
					t.Fatalf("unexpected URL %s", req.URL.String())
				}
				body, err := io.ReadAll(req.Body)
				if err != nil {
					t.Fatalf("read request body: %v", err)
				}
				if strings.TrimSpace(string(body)) != `{"id":"draft-1"}` {
					t.Fatalf("unexpected send draft body %q", string(body))
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body:       io.NopCloser(strings.NewReader(`{"id":"msg-1","threadId":"thread-1","labelIds":["SENT"]}`)),
				}, nil
			}),
		},
	}

	result, err := service.SendDraft(context.Background(), TokenEnvelope{AccessToken: "token-1"}, "draft-1")
	if err != nil {
		t.Fatalf("SendDraft returned error: %v", err)
	}
	if result.ID != "msg-1" || result.ThreadID != "thread-1" {
		t.Fatalf("unexpected send result %#v", result)
	}
}

func TestTrashAndDeleteMessageUseExpectedEndpoints(t *testing.T) {
	requests := make([]string, 0, 2)
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				requests = append(requests, req.Method+" "+req.URL.String())
				switch req.URL.String() {
				case apiURL + "/users/me/messages/msg-1/trash":
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body:       io.NopCloser(strings.NewReader(`{"id":"msg-1","threadId":"thread-1","labelIds":["TRASH"]}`)),
					}, nil
				case apiURL + "/users/me/messages/msg-1":
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body:       io.NopCloser(strings.NewReader("")),
					}, nil
				default:
					t.Fatalf("unexpected URL %s", req.URL.String())
					return nil, nil
				}
			}),
		},
	}

	result, err := service.TrashMessage(context.Background(), TokenEnvelope{AccessToken: "token-1"}, "msg-1")
	if err != nil {
		t.Fatalf("TrashMessage returned error: %v", err)
	}
	if result.ID != "msg-1" || len(result.LabelIDs) != 1 || result.LabelIDs[0] != "TRASH" {
		t.Fatalf("unexpected trash result %#v", result)
	}
	if err := service.DeleteMessage(context.Background(), TokenEnvelope{AccessToken: "token-1"}, "msg-1"); err != nil {
		t.Fatalf("DeleteMessage returned error: %v", err)
	}
	if len(requests) != 2 || requests[0] != "POST "+apiURL+"/users/me/messages/msg-1/trash" || requests[1] != "DELETE "+apiURL+"/users/me/messages/msg-1" {
		t.Fatalf("unexpected request sequence %#v", requests)
	}
}

func TestGetThreadIncludesAttachmentSummaries(t *testing.T) {
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.Method != http.MethodGet {
					t.Fatalf("expected GET, got %s", req.Method)
				}
				if req.URL.String() != apiURL+"/users/me/threads/thread-1?format=full" {
					t.Fatalf("unexpected thread URL %s", req.URL.String())
				}
				bodyText := base64.RawURLEncoding.EncodeToString([]byte("Body text"))
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body: io.NopCloser(strings.NewReader(`{
						"id":"thread-1",
						"historyId":"history-1",
						"snippet":"snippet",
						"messages":[{
							"id":"msg-1",
							"threadId":"thread-1",
							"labelIds":["INBOX"],
							"snippet":"message snippet",
							"internalDate":"1741777200000",
							"payload":{
								"mimeType":"multipart/mixed",
								"headers":[
									{"name":"From","value":"sender@example.com"},
									{"name":"Subject","value":"With attachments"},
									{"name":"Date","value":"Wed, 12 Mar 2026 11:00:00 +0000"}
								],
								"parts":[
									{"mimeType":"text/plain","body":{"data":"` + bodyText + `"}},
									{
										"mimeType":"text/plain",
										"filename":"notes.txt",
										"headers":[{"name":"Content-Disposition","value":"attachment; filename=notes.txt"}],
										"body":{"attachmentId":"att-1","size":12}
									},
									{
										"mimeType":"image/png",
										"filename":"diagram.png",
										"headers":[
											{"name":"Content-Disposition","value":"inline; filename=diagram.png"},
											{"name":"Content-ID","value":"<cid-1>"}
										],
										"body":{"attachmentId":"att-2","size":2048}
									}
								]
							}
						}]
					}`)),
				}, nil
			}),
		},
	}

	thread, err := service.GetThread(context.Background(), TokenEnvelope{AccessToken: "thread-token"}, "thread-1", GetThreadOptions{})
	if err != nil {
		t.Fatalf("GetThread returned error: %v", err)
	}
	if len(thread.Messages) != 1 {
		t.Fatalf("expected one message, got %#v", thread.Messages)
	}
	message := thread.Messages[0]
	if message.Body != "Body text" {
		t.Fatalf("expected plain-text body, got %q", message.Body)
	}
	if len(message.Attachments) != 2 {
		t.Fatalf("expected two attachments, got %#v", message.Attachments)
	}
	if message.Attachments[0].ID != "att-1" || message.Attachments[0].Filename != "notes.txt" || message.Attachments[0].MessageID != "msg-1" {
		t.Fatalf("unexpected first attachment %#v", message.Attachments[0])
	}
	if !message.Attachments[1].Inline || message.Attachments[1].ContentID != "cid-1" {
		t.Fatalf("expected inline image attachment, got %#v", message.Attachments[1])
	}
}

func TestGetAttachmentFetchesRemoteAttachmentData(t *testing.T) {
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				switch req.URL.String() {
				case apiURL + "/users/me/messages/msg-1?format=full":
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body: io.NopCloser(strings.NewReader(`{
							"id":"msg-1",
							"payload":{
								"mimeType":"multipart/mixed",
								"parts":[
									{
										"mimeType":"text/plain",
										"filename":"notes.txt",
										"headers":[{"name":"Content-Disposition","value":"attachment; filename=notes.txt"}],
										"body":{"attachmentId":"att-1","size":16}
									}
								]
							}
						}`)),
					}, nil
				case apiURL + "/users/me/messages/msg-1/attachments/att-1":
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body: io.NopCloser(strings.NewReader(`{
							"data":"` + base64.RawURLEncoding.EncodeToString([]byte("hello attachment")) + `",
							"size":16
						}`)),
					}, nil
				default:
					t.Fatalf("unexpected URL %s", req.URL.String())
					return nil, nil
				}
			}),
		},
	}

	attachment, err := service.GetAttachment(context.Background(), TokenEnvelope{AccessToken: "attachment-token"}, AttachmentRequest{
		MessageID:    "msg-1",
		AttachmentID: "att-1",
	})
	if err != nil {
		t.Fatalf("GetAttachment returned error: %v", err)
	}
	if attachment.Filename != "notes.txt" || attachment.MimeType != "text/plain" {
		t.Fatalf("unexpected attachment metadata %#v", attachment)
	}
	if !attachment.Previewable || attachment.Content != "hello attachment" {
		t.Fatalf("expected text preview, got %#v", attachment)
	}
	if string(attachment.Data) != "hello attachment" {
		t.Fatalf("unexpected attachment data %q", string(attachment.Data))
	}
}

func TestGetAttachmentReadsInlineAttachmentData(t *testing.T) {
	part := messagePart{
		MimeType: "application/json",
		Filename: "manifest.json",
	}
	part.Body.Data = base64.RawURLEncoding.EncodeToString([]byte("{\"ok\":true}"))
	part.Body.Size = 11
	part.Headers = []struct {
		Name  string `json:"name"`
		Value string `json:"value"`
	}{
		{Name: "Content-Disposition", Value: "attachment; filename=manifest.json"},
	}
	inlineID := attachmentReference(part)

	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.URL.String() != apiURL+"/users/me/messages/msg-inline?format=full" {
					t.Fatalf("unexpected URL %s", req.URL.String())
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body: io.NopCloser(strings.NewReader(`{
						"id":"msg-inline",
						"payload":{
							"mimeType":"multipart/mixed",
							"parts":[
								{
									"mimeType":"application/json",
									"filename":"manifest.json",
									"headers":[{"name":"Content-Disposition","value":"attachment; filename=manifest.json"}],
									"body":{"data":"` + part.Body.Data + `","size":11}
								}
							]
						}
					}`)),
				}, nil
			}),
		},
	}

	attachment, err := service.GetAttachment(context.Background(), TokenEnvelope{AccessToken: "inline-token"}, AttachmentRequest{
		MessageID:    "msg-inline",
		AttachmentID: inlineID,
	})
	if err != nil {
		t.Fatalf("GetAttachment returned error: %v", err)
	}
	if attachment.ID != inlineID {
		t.Fatalf("expected inline attachment id %q, got %#v", inlineID, attachment)
	}
	if !attachment.Previewable || attachment.Content != "{\"ok\":true}" {
		t.Fatalf("expected inline preview content, got %#v", attachment)
	}
}
