package middleware

import (
	"net/http"
	"sync"
	"time"

	vlog "github.com/loomtek/vellum/internal/logger"
)

type entry struct {
	count    int
	windowAt time.Time
}

type ipLimiter struct {
	mu      sync.Mutex
	entries map[string]*entry
	max     int
	window  time.Duration
}

func newIPLimiter(max int, window time.Duration) *ipLimiter {
	l := &ipLimiter{
		entries: make(map[string]*entry),
		max:     max,
		window:  window,
	}
	go l.cleanup()
	return l
}

func (l *ipLimiter) allow(ip, path string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	e, ok := l.entries[ip]
	if !ok || now.Sub(e.windowAt) > l.window {
		l.entries[ip] = &entry{count: 1, windowAt: now}
		return true
	}
	e.count++
	if e.count > l.max {
		vlog.Security("rate_limit_exceeded",
			"ip", ip,
			"path", path,
			"count", e.count,
		)
		return false
	}
	return true
}

func (l *ipLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		l.mu.Lock()
		cutoff := time.Now().Add(-l.window)
		for k, e := range l.entries {
			if e.windowAt.Before(cutoff) {
				delete(l.entries, k)
			}
		}
		l.mu.Unlock()
	}
}

// RateLimit returns an HTTP middleware that enforces a per-IP request limit
// within the given time window. Requests exceeding the limit receive a
// 429 Too Many Requests response.
func RateLimit(max int, window time.Duration) func(http.Handler) http.Handler {
	limiter := newIPLimiter(max, window)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !limiter.allow(r.RemoteAddr, r.URL.Path) {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", "60")
				w.WriteHeader(http.StatusTooManyRequests)
				w.Write([]byte(`{"error":"demasiadas solicitudes, intente más tarde."}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
