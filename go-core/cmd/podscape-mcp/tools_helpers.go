package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/podscape/go-core/internal/client"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// ── Constants ──────────────────────────────────────────────────────────────────

const (
	apiTimeout              = 30 * time.Second
	maxLogBytes             = 512 * 1024
	maxLogBytesPerContainer = 32 * 1024
)

// ── Arg helpers ───────────────────────────────────────────────────────────────

func args(req mcp.CallToolRequest) map[string]interface{} {
	if m, ok := req.Params.Arguments.(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{}
}

func argStr(req mcp.CallToolRequest, key string) string {
	v, _ := args(req)[key].(string)
	return v
}

func argFloat(req mcp.CallToolRequest, key string) (float64, bool) {
	v, ok := args(req)[key].(float64)
	return v, ok
}

func argBool(req mcp.CallToolRequest, key string) bool {
	v, _ := args(req)[key].(bool)
	return v
}

// argBoolDef returns the boolean argument value, or def if the key is absent.
func argBoolDef(req mcp.CallToolRequest, key string, def bool) bool {
	v, ok := args(req)[key]
	if !ok {
		return def
	}
	b, ok := v.(bool)
	if !ok {
		return def
	}
	return b
}

// ── Result helpers ─────────────────────────────────────────────────────────────

func errResult(err error) *mcp.CallToolResult {
	return mcp.NewToolResultError(err.Error())
}

func jsonResult(data interface{}) (*mcp.CallToolResult, error) {
	b, err := json.MarshalIndent(stripManagedFields(data), "", "  ")
	if err != nil {
		return errResult(err), nil
	}
	return mcp.NewToolResultText(string(b)), nil
}

// ── Log streaming ──────────────────────────────────────────────────────────────

func readLogStream(r io.ReadCloser, maxBytes int) string {
	defer r.Close()
	var sb strings.Builder
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 256*1024), 256*1024)
	for scanner.Scan() {
		if sb.Len()+len(scanner.Bytes())+1 > maxBytes {
			sb.WriteString(fmt.Sprintf("\n[output truncated — %d bytes limit reached]", maxBytes))
			return sb.String()
		}
		sb.WriteString(scanner.Text())
		sb.WriteByte('\n')
	}
	if err := scanner.Err(); err != nil {
		sb.WriteString(fmt.Sprintf("\n[error reading logs: %v]", err))
	}
	return sb.String()
}

// ── Strip helpers ──────────────────────────────────────────────────────────────

func stripItems(data interface{}) interface{} {
	b, err := json.Marshal(data)
	if err != nil {
		return data
	}
	var items []map[string]interface{}
	if err := json.Unmarshal(b, &items); err != nil {
		return data
	}
	for _, item := range items {
		if meta, ok := item["metadata"].(map[string]interface{}); ok {
			delete(meta, "managedFields")
		}
		if status, ok := item["status"].(map[string]interface{}); ok {
			delete(status, "images")
		}
	}
	return items
}

func stripSingle(data interface{}) interface{} {
	b, err := json.Marshal(data)
	if err != nil {
		return data
	}
	var item map[string]interface{}
	if err := json.Unmarshal(b, &item); err != nil {
		return data
	}
	if meta, ok := item["metadata"].(map[string]interface{}); ok {
		delete(meta, "managedFields")
	}
	if status, ok := item["status"].(map[string]interface{}); ok {
		delete(status, "images")
	}
	return item
}

func stripManagedFields(data interface{}) interface{} {
	b, err := json.Marshal(data)
	if err != nil {
		return data
	}
	var m interface{}
	if err := json.Unmarshal(b, &m); err != nil {
		return data
	}
	stripManagedFieldsRec(m)
	return m
}

func stripManagedFieldsRec(v interface{}) {
	switch val := v.(type) {
	case map[string]interface{}:
		delete(val, "managedFields")
		for _, child := range val {
			stripManagedFieldsRec(child)
		}
	case []interface{}:
		for _, item := range val {
			stripManagedFieldsRec(item)
		}
	}
}

// ── Dynamic client helpers ─────────────────────────────────────────────────────

// resolveGVR finds the GroupVersionResource for a given plural resource name.
func resolveGVR(b *client.ClientBundle, resource string) (schema.GroupVersionResource, error) {
	lists, err := b.Discovery.ServerPreferredResources()
	if err != nil && lists == nil {
		return schema.GroupVersionResource{}, err
	}
	for _, list := range lists {
		gv, err := schema.ParseGroupVersion(list.GroupVersion)
		if err != nil {
			continue
		}
		for _, r := range list.APIResources {
			if r.Name == resource {
				return schema.GroupVersionResource{Group: gv.Group, Version: gv.Version, Resource: r.Name}, nil
			}
		}
	}
	return schema.GroupVersionResource{}, fmt.Errorf("resource %q not found in cluster API groups", resource)
}

// listDynamic lists any resource via the dynamic client.
func listDynamic(ctx context.Context, b *client.ClientBundle, resource, ns string, lo metav1.ListOptions) (interface{}, error) {
	gvr, err := resolveGVR(b, resource)
	if err != nil {
		return nil, err
	}
	list, err := b.DynClient.Resource(gvr).Namespace(ns).List(ctx, lo)
	if err != nil {
		return nil, err
	}
	return list.Items, nil
}

// getDynamic fetches a single resource by name via the dynamic client.
func getDynamic(ctx context.Context, b *client.ClientBundle, resource, name, ns string) (interface{}, error) {
	gvr, err := resolveGVR(b, resource)
	if err != nil {
		return nil, err
	}
	obj, err := b.DynClient.Resource(gvr).Namespace(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	return obj.Object, nil
}

// ── Shared types ───────────────────────────────────────────────────────────────

type crdSummary struct {
	Name    string `json:"name"`
	Group   string `json:"group"`
	Kind    string `json:"kind"`
	Plural  string `json:"plural"`
	Scope   string `json:"scope"`
	Version string `json:"version"`
}

type eventSummary struct {
	Namespace string `json:"namespace,omitempty"`
	Type      string `json:"type,omitempty"`
	Reason    string `json:"reason"`
	Object    string `json:"object,omitempty"`
	Message   string `json:"message"`
	Count     int32  `json:"count"`
	LastSeen  string `json:"lastSeen"`
	Source    string `json:"source,omitempty"`
}

func summarizeEvent(e corev1.Event) eventSummary {
	return eventSummary{
		Namespace: e.Namespace,
		Type:      e.Type,
		Reason:    e.Reason,
		Object:    fmt.Sprintf("%s/%s", e.InvolvedObject.Kind, e.InvolvedObject.Name),
		Message:   e.Message,
		Count:     e.Count,
		LastSeen:  e.LastTimestamp.Format(time.RFC3339),
		Source:    e.Source.Component,
	}
}

// securityFinding represents a single security issue found during a pod scan.
type securityFinding struct {
	Pod       string `json:"pod"`
	Container string `json:"container"`
	Issue     string `json:"issue"`
	Severity  string `json:"severity"`
}
