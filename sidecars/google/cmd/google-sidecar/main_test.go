package main

import (
	"context"
	"testing"
)

func TestVersionDoesNotRequireAccessToken(t *testing.T) {
	resp := handleRequest(context.Background(), services{}, sidecarRequest{
		ID:     "req-1",
		Method: "sidecar.version",
	})
	if !resp.OK {
		t.Fatalf("expected version success, got %#v", resp.Error)
	}
	result, ok := resp.Result.(map[string]any)
	if !ok || result["protocolVersion"] != protocolVersion {
		t.Fatalf("unexpected version result %#v", resp.Result)
	}
}

func TestGoogleMethodsRequireAccessToken(t *testing.T) {
	resp := handleRequest(context.Background(), services{}, sidecarRequest{
		ID:     "req-2",
		Method: "gmail.search",
	})
	if resp.OK || resp.Error == nil {
		t.Fatalf("expected missing token error, got %#v", resp)
	}
	if resp.Error.Code != "missing_access_token" {
		t.Fatalf("expected missing_access_token, got %q", resp.Error.Code)
	}
}

func TestUnknownMethodReturnsStableError(t *testing.T) {
	resp := handleRequest(context.Background(), services{}, sidecarRequest{
		ID:          "req-3",
		Method:      "docs.edit",
		AccessToken: "token",
	})
	if resp.OK || resp.Error == nil {
		t.Fatalf("expected unknown method error, got %#v", resp)
	}
	if resp.Error.Code != "unknown_method" {
		t.Fatalf("expected unknown_method, got %q", resp.Error.Code)
	}
}
