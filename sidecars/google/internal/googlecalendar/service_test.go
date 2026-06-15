package googlecalendar

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/ambient-xyz/AmbientDesktop/sidecars/google/internal/gmail"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func TestCreateEventPostsRichTimedPayload(t *testing.T) {
	useDefaultReminders := false
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.Method != http.MethodPost {
					t.Fatalf("expected POST, got %s", req.Method)
				}
				if req.URL.Path != "/calendar/v3/calendars/primary/events" {
					t.Fatalf("expected create endpoint, got %s", req.URL.Path)
				}
				if req.URL.Query().Get("sendUpdates") != "all" {
					t.Fatalf("expected sendUpdates=all, got %q", req.URL.RawQuery)
				}
				if req.URL.Query().Get("conferenceDataVersion") != "1" {
					t.Fatalf("expected conferenceDataVersion=1, got %q", req.URL.RawQuery)
				}

				body, err := io.ReadAll(req.Body)
				if err != nil {
					t.Fatalf("read request body: %v", err)
				}
				var payload map[string]any
				if err := json.Unmarshal(body, &payload); err != nil {
					t.Fatalf("decode request body: %v", err)
				}
				if payload["summary"] != "Planning session" {
					t.Fatalf("expected summary, got %#v", payload["summary"])
				}
				if payload["eventType"] != "focusTime" {
					t.Fatalf("expected event type, got %#v", payload["eventType"])
				}

				start := payload["start"].(map[string]any)
				end := payload["end"].(map[string]any)
				if start["dateTime"] != "2026-03-20T16:00:00Z" || end["dateTime"] != "2026-03-20T17:00:00Z" {
					t.Fatalf("unexpected time payload: %#v %#v", start, end)
				}
				if start["timeZone"] != "America/Phoenix" || end["timeZone"] != "America/Phoenix" {
					t.Fatalf("unexpected timezone payload: %#v %#v", start, end)
				}

				attendees := payload["attendees"].([]any)
				if len(attendees) != 2 {
					t.Fatalf("expected 2 attendees, got %#v", attendees)
				}
				recurrence := payload["recurrence"].([]any)
				if len(recurrence) != 1 || recurrence[0] != "RRULE:FREQ=WEEKLY;BYDAY=FR" {
					t.Fatalf("unexpected recurrence: %#v", recurrence)
				}
				reminders := payload["reminders"].(map[string]any)
				if reminders["useDefault"] != false {
					t.Fatalf("expected useDefault=false, got %#v", reminders)
				}
				overrides := reminders["overrides"].([]any)
				if len(overrides) != 2 {
					t.Fatalf("expected reminder overrides, got %#v", overrides)
				}
				if _, ok := payload["conferenceData"].(map[string]any); !ok {
					t.Fatalf("expected conferenceData payload, got %#v", payload["conferenceData"])
				}

				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body: io.NopCloser(strings.NewReader(`{
						"id":"event-1",
						"summary":"Planning session",
						"eventType":"focusTime",
						"start":{"dateTime":"2026-03-20T16:00:00Z","timeZone":"America/Phoenix"},
						"end":{"dateTime":"2026-03-20T17:00:00Z","timeZone":"America/Phoenix"},
						"attendees":[{"email":"lead@example.com"},{"email":"ops@example.com"}],
						"conferenceData":{"entryPoints":[{"entryPointType":"video","uri":"https://meet.google.com/test-room"}]},
						"reminders":{"useDefault":false,"overrides":[{"method":"email","minutes":1440}]}
					}`)),
				}, nil
			}),
		},
	}

	event, err := service.CreateEvent(context.Background(), gmail.TokenEnvelope{AccessToken: "token-1"}, "primary", CreateEventRequest{
		Summary:             "Planning session",
		Description:         "Weekly staff sync",
		Location:            "War room",
		StartTime:           time.Date(2026, 3, 20, 16, 0, 0, 0, time.UTC),
		EndTime:             time.Date(2026, 3, 20, 17, 0, 0, 0, time.UTC),
		TimeZone:            "America/Phoenix",
		Attendees:           []string{"lead@example.com", "ops@example.com"},
		Recurrence:          []string{"RRULE:FREQ=WEEKLY;BYDAY=FR"},
		EventType:           "focusTime",
		UseDefaultReminders: &useDefaultReminders,
		ReminderOverrides: []ReminderOverride{
			{Method: "email", Minutes: 1440},
			{Method: "popup", Minutes: 30},
		},
		AddGoogleMeet: true,
		SendUpdates:   "all",
	})
	if err != nil {
		t.Fatalf("CreateEvent returned error: %v", err)
	}
	if event.ID != "event-1" {
		t.Fatalf("expected created event id, got %#v", event)
	}
	if event.ConferenceLink != "https://meet.google.com/test-room" {
		t.Fatalf("expected conference link, got %#v", event.ConferenceLink)
	}
	if event.TimeZone != "America/Phoenix" {
		t.Fatalf("expected time zone, got %#v", event.TimeZone)
	}
}

func TestUpdateEventAllDayUsesExclusiveEndDate(t *testing.T) {
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.Method != http.MethodPatch {
					t.Fatalf("expected PATCH, got %s", req.Method)
				}
				if req.URL.Path != "/calendar/v3/calendars/team/events/event-99" {
					t.Fatalf("expected update endpoint, got %s", req.URL.Path)
				}
				if req.URL.Query().Get("sendUpdates") != "none" {
					t.Fatalf("expected sendUpdates=none, got %q", req.URL.RawQuery)
				}

				body, err := io.ReadAll(req.Body)
				if err != nil {
					t.Fatalf("read request body: %v", err)
				}
				var payload map[string]any
				if err := json.Unmarshal(body, &payload); err != nil {
					t.Fatalf("decode request body: %v", err)
				}
				start := payload["start"].(map[string]any)
				end := payload["end"].(map[string]any)
				if start["date"] != "2026-03-22" {
					t.Fatalf("expected inclusive start date, got %#v", start)
				}
				if end["date"] != "2026-03-25" {
					t.Fatalf("expected exclusive end date, got %#v", end)
				}

				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body: io.NopCloser(strings.NewReader(`{
						"id":"event-99",
						"summary":"Company offsite",
						"start":{"date":"2026-03-22"},
						"end":{"date":"2026-03-25"}
					}`)),
				}, nil
			}),
		},
	}

	event, err := service.UpdateEvent(context.Background(), gmail.TokenEnvelope{AccessToken: "token-2"}, "team", "event-99", UpdateEventRequest{
		Summary:     "Company offsite",
		AllDay:      true,
		StartDate:   "2026-03-22",
		EndDate:     "2026-03-24",
		SendUpdates: "none",
	})
	if err != nil {
		t.Fatalf("UpdateEvent returned error: %v", err)
	}
	if !event.AllDay {
		t.Fatalf("expected all-day event, got %#v", event)
	}
	if event.StartDate != "2026-03-22" || event.EndDate != "2026-03-24" {
		t.Fatalf("expected inclusive all-day dates after decode, got %#v", event)
	}
}

func TestGetEventFallsBackToRecurringParentForInstanceIDs(t *testing.T) {
	service := &Service{
		httpClient: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				switch req.URL.Path {
				case "/calendar/v3/calendars/primary/events/series-123_20260403":
					return &http.Response{
						StatusCode: http.StatusNotFound,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body:       io.NopCloser(strings.NewReader(`{"error":{"message":"Not Found"}}`)),
					}, nil
				case "/calendar/v3/calendars/primary/events/series-123":
					return &http.Response{
						StatusCode: http.StatusOK,
						Header:     http.Header{"Content-Type": []string{"application/json"}},
						Body: io.NopCloser(strings.NewReader(`{
							"id":"series-123",
							"summary":"Weekly sync",
							"start":{"dateTime":"2026-04-03T17:00:00Z"},
							"end":{"dateTime":"2026-04-03T17:30:00Z"}
						}`)),
					}, nil
				default:
					t.Fatalf("unexpected path: %s", req.URL.Path)
					return nil, nil
				}
			}),
		},
	}

	event, err := service.GetEvent(context.Background(), gmail.TokenEnvelope{AccessToken: "token-3"}, "primary", "series-123_20260403")
	if err != nil {
		t.Fatalf("GetEvent returned error: %v", err)
	}
	if event.ID != "series-123" {
		t.Fatalf("expected fallback to parent recurring event, got %#v", event)
	}
	if event.Summary != "Weekly sync" {
		t.Fatalf("expected fallback event summary, got %#v", event)
	}
}
