package handlers

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/podscape/go-core/internal/exec"
)

// syncBuf is a mutex-guarded byte buffer. The real caller passes an
// *io.PipeWriter, which internally synchronizes concurrent Read/Write via
// channels — a plain *bytes.Buffer doesn't, so the test needs its own
// synchronization to safely poll from the main goroutine while
// runExecReadPump writes from the server goroutine.
type syncBuf struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuf) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuf) Close() error { return nil }

func (b *syncBuf) Len() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Len()
}

func (b *syncBuf) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// startReadPumpTestServer upgrades one connection, hands it to runExecReadPump,
// and returns a client-side *websocket.Conn plus the buffer that stdin writes land in.
func startReadPumpTestServer(t *testing.T) (client *websocket.Conn, stdin *syncBuf, sizeQueue *exec.SizeQueue, cleanup func()) {
	t.Helper()
	stdinBuf := &syncBuf{}
	sq := exec.NewSizeQueue()
	_, cancel := context.WithCancel(context.Background())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		runExecReadPump(conn, stdinBuf, sq, cancel)
	}))

	wsURL := "ws" + server.URL[len("http"):]
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}

	return ws, stdinBuf, sq, func() {
		ws.Close()
		server.Close()
		sq.Close()
	}
}

func TestRunExecReadPump_TextMessageGoesToStdin(t *testing.T) {
	ws, stdinBuf, _, cleanup := startReadPumpTestServer(t)
	defer cleanup()

	if err := ws.WriteMessage(websocket.TextMessage, []byte("ls -la\n")); err != nil {
		t.Fatalf("write: %v", err)
	}

	deadline := time.Now().Add(time.Second)
	for stdinBuf.Len() == 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}

	if got := stdinBuf.String(); got != "ls -la\n" {
		t.Errorf("stdin got %q, want %q", got, "ls -la\n")
	}
}

func TestRunExecReadPump_BinaryMessageIsResizeNotStdin(t *testing.T) {
	ws, stdinBuf, sizeQueue, cleanup := startReadPumpTestServer(t)
	defer cleanup()

	if err := ws.WriteMessage(websocket.BinaryMessage, []byte(`{"cols":100,"rows":40}`)); err != nil {
		t.Fatalf("write: %v", err)
	}

	done := make(chan struct{})
	var gotSize *struct{ Width, Height uint16 }
	go func() {
		s := sizeQueue.Next()
		if s != nil {
			gotSize = &struct{ Width, Height uint16 }{s.Width, s.Height}
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("sizeQueue.Next() never returned — resize message was not routed to the queue")
	}

	if gotSize == nil || gotSize.Width != 100 || gotSize.Height != 40 {
		t.Errorf("got %+v, want {100 40}", gotSize)
	}

	// The binary resize frame must NOT have been written to stdin.
	time.Sleep(20 * time.Millisecond) // let any (incorrect) stdin write land
	if stdinBuf.Len() != 0 {
		t.Errorf("stdin got %q, want empty — binary resize frame leaked into stdin", stdinBuf.String())
	}
}

func TestRunExecReadPump_MalformedResizeJSONIsIgnoredNotCrashed(t *testing.T) {
	ws, stdinBuf, _, cleanup := startReadPumpTestServer(t)
	defer cleanup()

	if err := ws.WriteMessage(websocket.BinaryMessage, []byte(`not json`)); err != nil {
		t.Fatalf("write: %v", err)
	}
	// Follow with a text message — if the pump crashed or exited on the
	// malformed frame, this write would never reach stdin.
	if err := ws.WriteMessage(websocket.TextMessage, []byte("ok\n")); err != nil {
		t.Fatalf("write: %v", err)
	}

	deadline := time.Now().Add(time.Second)
	for stdinBuf.Len() == 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}

	if got := stdinBuf.String(); got != "ok\n" {
		t.Errorf("stdin got %q, want %q (pump should survive malformed resize frame)", got, "ok\n")
	}
}
