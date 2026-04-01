package user

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/loomtek/vellum/internal/middleware"
	"github.com/loomtek/vellum/internal/storage"
)

// HandleList returns all registered users (admin only).
func HandleList(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		users, err := db.ListUsers()
		if err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		// Strip password hashes before returning.
		for i := range users {
			users[i].PasswordHash = ""
		}
		jsonOK(w, users)
	}
}

// HandleGet retrieves a user by ID. Non-admin users can only access their own record.
func HandleGet(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		callerID := middleware.GetUserID(r)

		if !middleware.IsAdmin(r) && id != callerID {
			jsonError(w, "acceso denegado", http.StatusForbidden)
			return
		}

		u, err := db.GetUserByID(id)
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				jsonError(w, "usuario no encontrado", http.StatusNotFound)
				return
			}
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		u.PasswordHash = ""
		jsonOK(w, u)
	}
}

// HandleUpdate modifies user fields. Non-admin users can only update their own name.
func HandleUpdate(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		callerID := middleware.GetUserID(r)
		isAdmin := middleware.IsAdmin(r)

		if !isAdmin && id != callerID {
			jsonError(w, "acceso denegado", http.StatusForbidden)
			return
		}

		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, "solicitud inválida", http.StatusBadRequest)
			return
		}

		u, err := db.GetUserByID(id)
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				jsonError(w, "usuario no encontrado", http.StatusNotFound)
				return
			}
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}

		if req.Name != "" {
			u.Name = req.Name
		}
		u.UpdatedAt = time.Now()

		if err := db.UpdateUser(u); err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}

		u.PasswordHash = ""
		jsonOK(w, u)
	}
}

func jsonOK(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
