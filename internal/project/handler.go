package project

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/loomtek/vellum/internal/domain"
	"github.com/loomtek/vellum/internal/middleware"
	"github.com/loomtek/vellum/internal/storage"
)

type createRequest struct {
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Senders      []string `json:"senders"`
	StorageLimit int64    `json:"storage_limit"`
}

type updateRequest struct {
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Senders      []string `json:"senders"`
	Active       *bool    `json:"active"`
	StorageLimit *int64   `json:"storage_limit"`
}

type addMemberRequest struct {
	UserID string `json:"user_id"`
}

type storageUsageEntry struct {
	UsedBytes  int64 `json:"used_bytes"`
	LimitBytes int64 `json:"limit_bytes"`
}

// HandleUnreadCounts returns a map of project ID to unread email count for the
// authenticated user.
func HandleUnreadCounts(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		callerID := middleware.GetUserID(r)

		var projectIDs []string
		if middleware.IsAdmin(r) {
			projects, err := db.ListProjects()
			if err != nil {
				jsonError(w, "error interno", http.StatusInternalServerError)
				return
			}
			for _, p := range projects {
				projectIDs = append(projectIDs, p.ID)
			}
		} else {
			ids, err := db.GetUserProjects(callerID)
			if err != nil {
				jsonError(w, "error interno", http.StatusInternalServerError)
				return
			}
			projectIDs = ids
		}

		counts, err := db.GetUnreadCounts(callerID, projectIDs)
		if err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		jsonOK(w, counts)
	}
}

// HandleList returns the projects visible to the authenticated user. Admins
// see all projects; regular users see only their memberships.
func HandleList(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if middleware.IsAdmin(r) {
			projects, err := db.ListProjects()
			if err != nil {
				jsonError(w, "error interno", http.StatusInternalServerError)
				return
			}
			jsonOK(w, projects)
			return
		}

		callerID := middleware.GetUserID(r)
		projectIDs, err := db.GetUserProjects(callerID)
		if err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}

		projects := make([]domain.Project, 0, len(projectIDs))
		for _, pid := range projectIDs {
			p, err := db.GetProject(pid)
			if err != nil {
				continue
			}
			if p.Active {
				projects = append(projects, *p)
			}
		}
		jsonOK(w, projects)
	}
}

// HandleCreate creates a new project (admin only).
func HandleCreate(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req createRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, "solicitud inválida", http.StatusBadRequest)
			return
		}
		if req.Name == "" {
			jsonError(w, "el nombre es requerido", http.StatusBadRequest)
			return
		}

		if conflict := findSenderConflict(db, req.Senders, ""); conflict != "" {
			jsonError(w, "el sender "+conflict+" ya está asignado a otro proyecto", http.StatusConflict)
			return
		}

		now := time.Now()
		p := &domain.Project{
			ID:           uuid.NewString(),
			Name:         req.Name,
			Description:  req.Description,
			Senders:      req.Senders,
			StorageLimit: req.StorageLimit,
			CreatedAt:    now,
			UpdatedAt:    now,
			Active:       true,
		}

		if err := db.CreateProject(p); err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
		jsonOK(w, p)
	}
}

// HandleGet retrieves a single project by ID, enforcing membership for non-admins.
func HandleGet(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")

		if !middleware.IsAdmin(r) {
			ok, err := db.IsMember(id, middleware.GetUserID(r))
			if err != nil || !ok {
				jsonError(w, "acceso denegado", http.StatusForbidden)
				return
			}
		}

		p, err := db.GetProject(id)
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				jsonError(w, "proyecto no encontrado", http.StatusNotFound)
				return
			}
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		jsonOK(w, p)
	}
}

// HandleUpdate modifies an existing project (admin only).
func HandleUpdate(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")

		var req updateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, "solicitud inválida", http.StatusBadRequest)
			return
		}

		p, err := db.GetProject(id)
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				jsonError(w, "proyecto no encontrado", http.StatusNotFound)
				return
			}
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}

		if req.Name != "" {
			p.Name = req.Name
		}
		if req.Description != "" {
			p.Description = req.Description
		}
		if req.Senders != nil {
			if conflict := findSenderConflict(db, req.Senders, id); conflict != "" {
				jsonError(w, "el sender "+conflict+" ya está asignado a otro proyecto", http.StatusConflict)
				return
			}
			p.Senders = req.Senders
		}
		if req.Active != nil {
			p.Active = *req.Active
		}
		if req.StorageLimit != nil {
			p.StorageLimit = *req.StorageLimit
		}
		p.UpdatedAt = time.Now()

		if err := db.UpdateProject(p); err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		jsonOK(w, p)
	}
}

// HandleDelete soft-deletes a project and cascades to its emails (admin only).
func HandleDelete(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if err := db.SoftDeleteProject(id); err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				jsonError(w, "proyecto no encontrado", http.StatusNotFound)
				return
			}
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// HandleProjectStorage returns the current and limit storage usage for a project.
func HandleProjectStorage(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if !middleware.IsAdmin(r) {
			ok, err := db.IsMember(id, middleware.GetUserID(r))
			if err != nil || !ok {
				jsonError(w, "acceso denegado", http.StatusForbidden)
				return
			}
		}
		p, err := db.GetProject(id)
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				jsonError(w, "proyecto no encontrado", http.StatusNotFound)
				return
			}
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		used, err := db.GetProjectStorageUsage(id)
		if err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		jsonOK(w, map[string]int64{"used_bytes": used, "limit_bytes": p.StorageLimit})
	}
}

// HandleStorageUsages returns storage usage for all projects (admin only).
func HandleStorageUsages(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projects, err := db.ListProjects()
		if err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		result := make(map[string]storageUsageEntry, len(projects))
		for _, p := range projects {
			used, err := db.GetProjectStorageUsage(p.ID)
			if err != nil {
				continue
			}
			result[p.ID] = storageUsageEntry{UsedBytes: used, LimitBytes: p.StorageLimit}
		}
		jsonOK(w, result)
	}
}

// HandleListTrashedProjects returns all soft-deleted projects (admin only).
func HandleListTrashedProjects(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projects, err := db.ListTrashedProjects()
		if err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		jsonOK(w, projects)
	}
}

// HandleRestoreProject reverses a project soft-delete and restores its emails (admin only).
func HandleRestoreProject(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if err := db.RestoreProject(id); err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				jsonError(w, "proyecto no encontrado", http.StatusNotFound)
				return
			}
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		p, _ := db.GetProject(id)
		jsonOK(w, p)
	}
}

// HandlePurgeProject permanently removes a project and all associated data (admin only).
func HandlePurgeProject(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if err := db.PurgeProject(id); err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				jsonError(w, "proyecto no encontrado", http.StatusNotFound)
				return
			}
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// HandleListMembers returns all members of a project (admin only).
func HandleListMembers(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		members, err := db.GetProjectMembers(id)
		if err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		jsonOK(w, members)
	}
}

// HandleAddMember adds a user to a project (admin only).
func HandleAddMember(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := chi.URLParam(r, "id")

		var req addMemberRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, "solicitud inválida", http.StatusBadRequest)
			return
		}
		if req.UserID == "" {
			jsonError(w, "user_id es requerido", http.StatusBadRequest)
			return
		}

		pm := &domain.ProjectMember{
			ProjectID: projectID,
			UserID:    req.UserID,
			AddedAt:   time.Now(),
		}
		if err := db.AddMember(pm); err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		jsonOK(w, pm)
	}
}

// HandleRemoveMember removes a user from a project (admin only).
func HandleRemoveMember(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := chi.URLParam(r, "id")
		userID := chi.URLParam(r, "uid")

		if err := db.RemoveMember(projectID, userID); err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// findSenderConflict returns the first sender that is already used by a different project.
// excludeID is the ID of the project being updated (empty string when creating).
func findSenderConflict(db *storage.DB, senders []string, excludeID string) string {
	existing, err := db.ListProjects()
	if err != nil {
		return ""
	}
	for _, s := range senders {
		normalized := strings.ToLower(strings.TrimSpace(s))
		if normalized == "" {
			continue
		}
		for _, p := range existing {
			if p.ID == excludeID {
				continue
			}
			for _, es := range p.Senders {
				if strings.ToLower(strings.TrimSpace(es)) == normalized {
					return s
				}
			}
		}
	}
	return ""
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

