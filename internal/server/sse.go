package server

import (
	"encoding/json"
	"log/slog"
	"sync"

	"github.com/loomtek/vellum/internal/domain"
)

type sseClient struct {
	userID     string
	projectIDs map[string]struct{}
	ch         chan []byte
}

// SSEHub manages Server-Sent Events connections for real-time email notifications.
type SSEHub struct {
	mu        sync.RWMutex
	clients   map[*sseClient]struct{}
	register  chan *sseClient
	remove    chan *sseClient
	broadcast chan *domain.Email
}

// NewSSEHub creates an SSEHub with pre-allocated channels.
func NewSSEHub() *SSEHub {
	return &SSEHub{
		clients:   make(map[*sseClient]struct{}),
		register:  make(chan *sseClient, 16),
		remove:    make(chan *sseClient, 16),
		broadcast: make(chan *domain.Email, 64),
	}
}

// Run is the event loop that processes client registrations, removals, and
// broadcasts. It should be started as a goroutine.
func (h *SSEHub) Run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			h.clients[c] = struct{}{}
			h.mu.Unlock()

		case c := <-h.remove:
			h.mu.Lock()
			delete(h.clients, c)
			h.mu.Unlock()
			close(c.ch)

		case e := <-h.broadcast:
			payload, err := buildSSEPayload(e)
			if err != nil {
				continue
			}
			h.mu.RLock()
			for c := range h.clients {
				if canReceive(c, e) {
					select {
					case c.ch <- payload:
					default:
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Broadcast enqueues an email notification for delivery to all eligible
// connected clients. Drops the event if the channel is full.
func (h *SSEHub) Broadcast(e *domain.Email) {
	select {
	case h.broadcast <- e:
	default:
		slog.Warn("sse broadcast channel full, dropping notification", "email_id", e.ID)
	}
}

func canReceive(c *sseClient, e *domain.Email) bool {
	if _, ok := c.projectIDs["*"]; ok {
		return true
	}
	if e.ProjectID == "" {
		return false
	}
	_, ok := c.projectIDs[e.ProjectID]
	return ok
}

func buildSSEPayload(e *domain.Email) ([]byte, error) {
	type eventData struct {
		Type      string        `json:"type"`
		ProjectID string        `json:"project_id"`
		Email     *domain.Email `json:"email"`
	}
	data, err := json.Marshal(eventData{Type: "email", ProjectID: e.ProjectID, Email: e})
	if err != nil {
		return nil, err
	}
	return append([]byte("data: "), append(data, '\n', '\n')...), nil
}
