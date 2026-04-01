package mail

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/loomtek/vellum/internal/analysis"
	"github.com/loomtek/vellum/internal/middleware"
	smtprelay "github.com/loomtek/vellum/internal/smtp"
	"github.com/loomtek/vellum/internal/storage"
)

type pageMeta struct {
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

type listResponse struct {
	Data interface{} `json:"data"`
	Meta pageMeta    `json:"meta"`
}

func parsePage(r *http.Request) (page, pageSize int) {
	page, _ = strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ = strconv.Atoi(r.URL.Query().Get("page_size"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}
	return
}

func checkProjectAccess(db *storage.DB, r *http.Request, projectID string) bool {
	if middleware.IsAdmin(r) {
		return true
	}
	ok, _ := db.IsMember(projectID, middleware.GetUserID(r))
	return ok
}

// HandleList returns a paginated list of emails for the given project.
func HandleList(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := chi.URLParam(r, "id")
		if !checkProjectAccess(db, r, projectID) {
			jsonError(w, "acceso denegado", http.StatusForbidden)
			return
		}

		page, pageSize := parsePage(r)
		emails, total, err := db.ListEmailsByProject(projectID, page, pageSize)
		if err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}

		jsonOK(w, listResponse{
			Data: emails,
			Meta: pageMeta{Page: page, PageSize: pageSize, Total: total},
		})
	}
}

// HandleGet retrieves a single email by project and email ID, marking it as
// read for the authenticated user.
func HandleGet(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := chi.URLParam(r, "id")
		emailID := chi.URLParam(r, "eid")

		if !checkProjectAccess(db, r, projectID) {
			jsonError(w, "acceso denegado", http.StatusForbidden)
			return
		}

		e, err := db.GetEmail(emailID)
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				jsonError(w, "correo no encontrado", http.StatusNotFound)
				return
			}
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}

		if e.ProjectID != projectID {
			jsonError(w, "correo no encontrado", http.StatusNotFound)
			return
		}

		_ = db.MarkRead(middleware.GetUserID(r), emailID)
		jsonOK(w, e)
	}
}

// HandleDelete soft-deletes an email within a project scope.
func HandleDelete(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := chi.URLParam(r, "id")
		emailID := chi.URLParam(r, "eid")

		if !checkProjectAccess(db, r, projectID) {
			jsonError(w, "acceso denegado", http.StatusForbidden)
			return
		}

		e, err := db.GetEmail(emailID)
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				jsonError(w, "correo no encontrado", http.StatusNotFound)
				return
			}
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		if e.ProjectID != projectID {
			jsonError(w, "correo no encontrado", http.StatusNotFound)
			return
		}

		if err := db.SoftDeleteEmail(emailID); err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// HandleMarkRead marks a specific email as read for the authenticated user.
func HandleMarkRead(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := chi.URLParam(r, "id")
		emailID := chi.URLParam(r, "eid")

		if !checkProjectAccess(db, r, projectID) {
			jsonError(w, "acceso denegado", http.StatusForbidden)
			return
		}

		if err := db.MarkRead(middleware.GetUserID(r), emailID); err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		jsonOK(w, map[string]bool{"ok": true})
	}
}

// HandleListAll returns a paginated list of all emails across projects (admin).
func HandleListAll(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		page, pageSize := parsePage(r)
		emails, total, err := db.ListAllEmails(page, pageSize)
		if err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		jsonOK(w, listResponse{
			Data: emails,
			Meta: pageMeta{Page: page, PageSize: pageSize, Total: total},
		})
	}
}

// HandleDeleteAny permanently deletes an email regardless of project (admin).
func HandleDeleteAny(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		emailID := chi.URLParam(r, "eid")
		if err := db.DeleteEmail(emailID); err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				jsonError(w, "correo no encontrado", http.StatusNotFound)
				return
			}
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// HandleDeleteAllByProject soft-deletes all emails for a project (admin).
func HandleDeleteAllByProject(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := chi.URLParam(r, "id")
		if err := db.SoftDeleteEmailsByProject(projectID); err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		jsonOK(w, map[string]bool{"ok": true})
	}
}

// HandleListTrash returns a paginated list of trashed emails for a project.
func HandleListTrash(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := chi.URLParam(r, "id")
		if !checkProjectAccess(db, r, projectID) {
			jsonError(w, "acceso denegado", http.StatusForbidden)
			return
		}
		page, pageSize := parsePage(r)
		emails, total, err := db.ListTrashedEmailsByProject(projectID, page, pageSize)
		if err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		jsonOK(w, listResponse{
			Data: emails,
			Meta: pageMeta{Page: page, PageSize: pageSize, Total: total},
		})
	}
}

// HandleRestoreEmails restores previously trashed emails by their IDs.
func HandleRestoreEmails(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := chi.URLParam(r, "id")
		if !checkProjectAccess(db, r, projectID) {
			jsonError(w, "acceso denegado", http.StatusForbidden)
			return
		}
		var req struct {
			IDs []string `json:"ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.IDs) == 0 {
			jsonError(w, "ids requeridos", http.StatusBadRequest)
			return
		}
		for _, id := range req.IDs {
			_ = db.RestoreEmail(id)
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// HandleDeleteTrashedEmail permanently deletes a single trashed email.
func HandleDeleteTrashedEmail(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := chi.URLParam(r, "id")
		emailID := chi.URLParam(r, "eid")
		if !checkProjectAccess(db, r, projectID) {
			jsonError(w, "acceso denegado", http.StatusForbidden)
			return
		}
		e, err := db.GetEmail(emailID)
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				jsonError(w, "correo no encontrado", http.StatusNotFound)
				return
			}
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		if e.ProjectID != projectID {
			jsonError(w, "correo no encontrado", http.StatusNotFound)
			return
		}
		if err := db.DeleteEmail(emailID); err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// HandlePurgeProjectTrash permanently deletes all trashed emails for a project.
func HandlePurgeProjectTrash(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := chi.URLParam(r, "id")
		if !checkProjectAccess(db, r, projectID) {
			jsonError(w, "acceso denegado", http.StatusForbidden)
			return
		}
		if err := db.PurgeProjectTrash(projectID); err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// HandleAnalyze runs the email analysis engine on a specific email and returns
// the detailed report.
func HandleAnalyze(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := chi.URLParam(r, "id")
		emailID := chi.URLParam(r, "eid")

		if !checkProjectAccess(db, r, projectID) {
			jsonError(w, "acceso denegado", http.StatusForbidden)
			return
		}

		e, err := db.GetEmail(emailID)
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				jsonError(w, "correo no encontrado", http.StatusNotFound)
				return
			}
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		if e.ProjectID != projectID {
			jsonError(w, "correo no encontrado", http.StatusNotFound)
			return
		}

		lang := r.URL.Query().Get("lang")
		jsonOK(w, analysis.Analyze(e, lang))
	}
}

// HandleRelayEmail forwards a captured email to the specified recipients via the
// configured SMTP relay.
func HandleRelayEmail(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := chi.URLParam(r, "id")
		emailID := chi.URLParam(r, "eid")

		if !checkProjectAccess(db, r, projectID) {
			jsonError(w, "acceso denegado", http.StatusForbidden)
			return
		}

		var req struct {
			To []string `json:"to"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.To) == 0 {
			jsonError(w, "se requiere al menos un destinatario", http.StatusBadRequest)
			return
		}

		e, err := db.GetEmail(emailID)
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				jsonError(w, "correo no encontrado", http.StatusNotFound)
				return
			}
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		if e.ProjectID != projectID {
			jsonError(w, "correo no encontrado", http.StatusNotFound)
			return
		}

		cfg, err := db.GetSMTPConfig()
		if err != nil {
			jsonError(w, "smtp relay no configurado", http.StatusServiceUnavailable)
			return
		}
		if !cfg.Enabled {
			jsonError(w, "smtp relay no está habilitado", http.StatusServiceUnavailable)
			return
		}

		if err := smtprelay.SendEmail(cfg, e, req.To); err != nil {
			jsonError(w, "error al enviar: "+err.Error(), http.StatusBadGateway)
			return
		}

		jsonOK(w, map[string]bool{"ok": true})
	}
}

// HandleTrashStats returns the count and total size of trashed emails for a project.
func HandleTrashStats(db *storage.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := chi.URLParam(r, "id")
		if !checkProjectAccess(db, r, projectID) {
			jsonError(w, "acceso denegado", http.StatusForbidden)
			return
		}
		count, sizeBytes, err := db.GetProjectTrashStats(projectID)
		if err != nil {
			jsonError(w, "error interno", http.StatusInternalServerError)
			return
		}
		jsonOK(w, map[string]int64{"total": int64(count), "size_bytes": sizeBytes})
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
