package middleware

import (
	"context"
	"net/http"

	"github.com/loomtek/vellum/internal/auth"
	"github.com/loomtek/vellum/internal/domain"
	vlog "github.com/loomtek/vellum/internal/logger"
)

type contextKey string

const (
	contextKeyClaims contextKey = "claims"
	contextKeyUserID contextKey = "user_id"
	contextKeyRole   contextKey = "role"
)

// Auth returns an HTTP middleware that validates the access_token cookie and
// injects the parsed claims, user ID, and role into the request context.
func Auth(tokens *auth.TokenManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie("access_token")
			if err != nil {
				jsonUnauthorized(w)
				return
			}

			claims, err := tokens.ValidateAccessToken(cookie.Value)
			if err != nil {
				vlog.Security("invalid_access_token",
					"ip", r.RemoteAddr,
					"path", r.URL.Path,
					"error", err.Error(),
				)
				jsonUnauthorized(w)
				return
			}

			ctx := r.Context()
			ctx = context.WithValue(ctx, contextKeyClaims, claims)
			ctx = context.WithValue(ctx, contextKeyUserID, claims.UserID)
			ctx = context.WithValue(ctx, contextKeyRole, claims.Role)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireAdmin rejects requests from non-admin users with 403 Forbidden.
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if GetRole(r) != domain.RoleAdmin {
			jsonForbidden(w)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// GetClaims extracts the JWT claims stored in the request context by Auth.
func GetClaims(r *http.Request) *auth.Claims {
	v, _ := r.Context().Value(contextKeyClaims).(*auth.Claims)
	return v
}

// GetUserID extracts the authenticated user ID from the request context.
func GetUserID(r *http.Request) string {
	v, _ := r.Context().Value(contextKeyUserID).(string)
	return v
}

// GetRole extracts the authenticated user's role from the request context.
func GetRole(r *http.Request) domain.Role {
	v, _ := r.Context().Value(contextKeyRole).(domain.Role)
	return v
}

// IsAdmin reports whether the authenticated user has the admin role.
func IsAdmin(r *http.Request) bool {
	return GetRole(r) == domain.RoleAdmin
}

func jsonUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	w.Write([]byte(`{"error":"no autorizado"}`))
}

func jsonForbidden(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	w.Write([]byte(`{"error":"acceso denegado"}`))
}
