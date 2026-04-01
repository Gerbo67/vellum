package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/loomtek/vellum/internal/domain"
	bolt "go.etcd.io/bbolt"
)

var (
	// ErrNotFound is returned when a requested record does not exist.
	ErrNotFound = errors.New("not found")
	// ErrConflict is returned when a unique constraint is violated (e.g. duplicate email).
	ErrConflict = errors.New("conflict")
)

var (
	bucketConfig         = []byte("config")
	bucketUsers          = []byte("users")
	bucketUserByEmail    = []byte("user_by_email")
	bucketUserByOIDCSub  = []byte("user_by_oidc_sub")
	bucketTokenFamilies  = []byte("token_families")
	bucketProjects       = []byte("projects")
	bucketProjectMembers = []byte("project_members")
	bucketEmails         = []byte("emails")
	bucketEmailByProject = []byte("email_by_project")
	bucketEmailTrash     = []byte("email_trash")
	bucketSMTPConfig     = []byte("smtp_config")
	bucketRelayAddresses = []byte("relay_addresses")

	// Multi-provider auth buckets
	bucketProviderIdentities  = []byte("provider_identities")   // id → ProviderIdentity
	bucketIdentityByProvider  = []byte("identity_by_provider")  // "provider:providerID" → identityID
	bucketIdentitiesByUser    = []byte("identities_by_user")    // "userID:provider" → identityID
	bucketAuthProviderConfigs = []byte("auth_provider_configs") // providerName → AuthProviderConfig
	bucketInvitations         = []byte("invitations")           // id → Invitation
	bucketInvitationByToken   = []byte("invitation_by_token")   // token → invitationID
	bucketInvitationByUser    = []byte("invitation_by_user")    // userID → invitationID
)

// DB wraps a bbolt database and provides typed CRUD operations for all
// Vellum domain entities.
type DB struct {
	bolt *bolt.DB
}

// Open creates or opens the bbolt database at path and ensures all required
// buckets exist.
func Open(path string) (*DB, error) {
	db, err := bolt.Open(path, 0600, &bolt.Options{Timeout: 5 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("open bbolt: %w", err)
	}

	buckets := [][]byte{
		bucketConfig, bucketUsers, bucketUserByEmail, bucketUserByOIDCSub,
		bucketTokenFamilies, bucketProjects, bucketProjectMembers,
		bucketEmails, bucketEmailByProject, bucketEmailTrash, bucketSMTPConfig, bucketRelayAddresses,
		bucketProviderIdentities, bucketIdentityByProvider, bucketIdentitiesByUser,
		bucketAuthProviderConfigs, bucketInvitations, bucketInvitationByToken, bucketInvitationByUser,
	}

	err = db.Update(func(tx *bolt.Tx) error {
		for _, b := range buckets {
			if _, err := tx.CreateBucketIfNotExists(b); err != nil {
				return fmt.Errorf("create bucket %s: %w", b, err)
			}
		}
		return nil
	})
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("init buckets: %w", err)
	}

	return &DB{bolt: db}, nil
}

// Close releases the underlying bbolt file handle.
func (d *DB) Close() error {
	return d.bolt.Close()
}

// ---- Config ----

// GetConfig returns the persisted application configuration.
func (d *DB) GetConfig() (*domain.AppConfig, error) {
	var cfg domain.AppConfig
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketConfig)
		v := b.Get([]byte("app_config"))
		if v == nil {
			return nil
		}
		return json.Unmarshal(v, &cfg)
	})
	if err != nil {
		return nil, err
	}
	return &cfg, nil
}

// SaveConfig persists the application configuration.
func (d *DB) SaveConfig(cfg *domain.AppConfig) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketConfig)
		data, err := json.Marshal(cfg)
		if err != nil {
			return err
		}
		return b.Put([]byte("app_config"), data)
	})
}

// ---- Users ----

// CreateUser inserts a new user, indexing it by email and optionally by OIDC subject.
// Returns ErrConflict if the email is already registered.
func (d *DB) CreateUser(u *domain.User) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		bu := tx.Bucket(bucketUsers)
		be := tx.Bucket(bucketUserByEmail)

		if existing := be.Get([]byte(u.Email)); existing != nil {
			return ErrConflict
		}

		data, err := json.Marshal(u)
		if err != nil {
			return err
		}
		if err := bu.Put([]byte(u.ID), data); err != nil {
			return err
		}
		if err := be.Put([]byte(u.Email), []byte(u.ID)); err != nil {
			return err
		}
		if u.OIDCSub != "" {
			bo := tx.Bucket(bucketUserByOIDCSub)
			if err := bo.Put([]byte(u.OIDCSub), []byte(u.ID)); err != nil {
				return err
			}
		}
		return nil
	})
}

// GetUserByID retrieves a user by primary key.
func (d *DB) GetUserByID(id string) (*domain.User, error) {
	var u domain.User
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketUsers)
		v := b.Get([]byte(id))
		if v == nil {
			return ErrNotFound
		}
		return json.Unmarshal(v, &u)
	})
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// GetUserByEmail looks up a user through the email index.
func (d *DB) GetUserByEmail(email string) (*domain.User, error) {
	var u domain.User
	err := d.bolt.View(func(tx *bolt.Tx) error {
		be := tx.Bucket(bucketUserByEmail)
		idBytes := be.Get([]byte(email))
		if idBytes == nil {
			return ErrNotFound
		}
		bu := tx.Bucket(bucketUsers)
		v := bu.Get(idBytes)
		if v == nil {
			return ErrNotFound
		}
		return json.Unmarshal(v, &u)
	})
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// GetUserByOIDCSub looks up a user through the OIDC subject index.
func (d *DB) GetUserByOIDCSub(sub string) (*domain.User, error) {
	var u domain.User
	err := d.bolt.View(func(tx *bolt.Tx) error {
		bo := tx.Bucket(bucketUserByOIDCSub)
		idBytes := bo.Get([]byte(sub))
		if idBytes == nil {
			return ErrNotFound
		}
		bu := tx.Bucket(bucketUsers)
		v := bu.Get(idBytes)
		if v == nil {
			return ErrNotFound
		}
		return json.Unmarshal(v, &u)
	})
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// ListUsers returns all registered users.
func (d *DB) ListUsers() ([]domain.User, error) {
	users := make([]domain.User, 0)
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketUsers)
		return b.ForEach(func(k, v []byte) error {
			var u domain.User
			if err := json.Unmarshal(v, &u); err != nil {
				return err
			}
			users = append(users, u)
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	return users, nil
}

// UpdateUser persists changes to an existing user, maintaining secondary
// indexes on email and OIDC subject.
func (d *DB) UpdateUser(u *domain.User) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		bu := tx.Bucket(bucketUsers)
		existing := bu.Get([]byte(u.ID))
		if existing == nil {
			return ErrNotFound
		}

		var old domain.User
		if err := json.Unmarshal(existing, &old); err != nil {
			return err
		}

		if old.Email != u.Email {
			be := tx.Bucket(bucketUserByEmail)
			be.Delete([]byte(old.Email))
			be.Put([]byte(u.Email), []byte(u.ID))
		}

		if old.OIDCSub != u.OIDCSub {
			bo := tx.Bucket(bucketUserByOIDCSub)
			if old.OIDCSub != "" {
				bo.Delete([]byte(old.OIDCSub))
			}
			if u.OIDCSub != "" {
				bo.Put([]byte(u.OIDCSub), []byte(u.ID))
			}
		}

		data, err := json.Marshal(u)
		if err != nil {
			return err
		}
		return bu.Put([]byte(u.ID), data)
	})
}

// DeleteUser removes a user and its secondary index entries.
func (d *DB) DeleteUser(id string) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		bu := tx.Bucket(bucketUsers)
		existing := bu.Get([]byte(id))
		if existing == nil {
			return ErrNotFound
		}

		var u domain.User
		if err := json.Unmarshal(existing, &u); err != nil {
			return err
		}

		be := tx.Bucket(bucketUserByEmail)
		be.Delete([]byte(u.Email))

		if u.OIDCSub != "" {
			bo := tx.Bucket(bucketUserByOIDCSub)
			bo.Delete([]byte(u.OIDCSub))
		}

		return bu.Delete([]byte(id))
	})
}

// ---- Token Families ----

// CreateFamily persists a new token family.
func (d *DB) CreateFamily(f *domain.TokenFamily) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketTokenFamilies)
		data, err := json.Marshal(f)
		if err != nil {
			return err
		}
		return b.Put([]byte(f.FamilyID), data)
	})
}

// GetFamily retrieves a token family by ID.
func (d *DB) GetFamily(familyID string) (*domain.TokenFamily, error) {
	var f domain.TokenFamily
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketTokenFamilies)
		v := b.Get([]byte(familyID))
		if v == nil {
			return ErrNotFound
		}
		return json.Unmarshal(v, &f)
	})
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// SaveFamily persists an updated token family (e.g. after rotation or invalidation).
func (d *DB) SaveFamily(f *domain.TokenFamily) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketTokenFamilies)
		data, err := json.Marshal(f)
		if err != nil {
			return err
		}
		return b.Put([]byte(f.FamilyID), data)
	})
}

// RevokeAllFamiliesForUser marks every token family owned by a user as
// invalidated. Used when a user is suspended or archived.
func (d *DB) RevokeAllFamiliesForUser(userID string) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketTokenFamilies)
		var toRevoke []domain.TokenFamily
		if err := b.ForEach(func(_, v []byte) error {
			var f domain.TokenFamily
			if err := json.Unmarshal(v, &f); err != nil {
				return err
			}
			if f.UserID == userID && !f.Invalidated {
				toRevoke = append(toRevoke, f)
			}
			return nil
		}); err != nil {
			return err
		}
		for _, f := range toRevoke {
			f.Invalidated = true
			data, err := json.Marshal(f)
			if err != nil {
				return err
			}
			if err := b.Put([]byte(f.FamilyID), data); err != nil {
				return err
			}
		}
		return nil
	})
}

// DeleteFamily removes a token family from storage.
func (d *DB) DeleteFamily(familyID string) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketTokenFamilies)
		return b.Delete([]byte(familyID))
	})
}

// ---- Projects ----

// CreateProject persists a new project.
func (d *DB) CreateProject(p *domain.Project) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketProjects)
		data, err := json.Marshal(p)
		if err != nil {
			return err
		}
		return b.Put([]byte(p.ID), data)
	})
}

// GetProject retrieves a project by ID.
func (d *DB) GetProject(id string) (*domain.Project, error) {
	var p domain.Project
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketProjects)
		v := b.Get([]byte(id))
		if v == nil {
			return ErrNotFound
		}
		return json.Unmarshal(v, &p)
	})
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// ListProjects returns all non-deleted projects.
func (d *DB) ListProjects() ([]domain.Project, error) {
	projects := make([]domain.Project, 0)
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketProjects)
		return b.ForEach(func(k, v []byte) error {
			var p domain.Project
			if err := json.Unmarshal(v, &p); err != nil {
				return err
			}
			if p.DeletedAt == nil {
				projects = append(projects, p)
			}
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	return projects, nil
}

// UpdateProject persists changes to an existing project.
func (d *DB) UpdateProject(p *domain.Project) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketProjects)
		if b.Get([]byte(p.ID)) == nil {
			return ErrNotFound
		}
		data, err := json.Marshal(p)
		if err != nil {
			return err
		}
		return b.Put([]byte(p.ID), data)
	})
}

// DeleteProject permanently removes a project record.
func (d *DB) DeleteProject(id string) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketProjects)
		if b.Get([]byte(id)) == nil {
			return ErrNotFound
		}
		return b.Delete([]byte(id))
	})
}

// ---- Project Members ----

// AddMember creates a project-user membership record.
func (d *DB) AddMember(pm *domain.ProjectMember) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketProjectMembers)
		key := pm.ProjectID + ":" + pm.UserID
		data, err := json.Marshal(pm)
		if err != nil {
			return err
		}
		return b.Put([]byte(key), data)
	})
}

// RemoveMember deletes the membership between a project and a user.
func (d *DB) RemoveMember(projectID, userID string) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketProjectMembers)
		key := projectID + ":" + userID
		return b.Delete([]byte(key))
	})
}

// GetProjectMembers returns all members of the given project.
func (d *DB) GetProjectMembers(projectID string) ([]domain.ProjectMember, error) {
	members := make([]domain.ProjectMember, 0)
	prefix := projectID + ":"
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketProjectMembers)
		c := b.Cursor()
		for k, v := c.Seek([]byte(prefix)); k != nil && strings.HasPrefix(string(k), prefix); k, v = c.Next() {
			var pm domain.ProjectMember
			if err := json.Unmarshal(v, &pm); err != nil {
				return err
			}
			members = append(members, pm)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return members, nil
}

// GetUserProjects returns the project IDs the user is a member of.
func (d *DB) GetUserProjects(userID string) ([]string, error) {
	projectIDs := make([]string, 0)
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketProjectMembers)
		return b.ForEach(func(k, v []byte) error {
			var pm domain.ProjectMember
			if err := json.Unmarshal(v, &pm); err != nil {
				return err
			}
			if pm.UserID == userID {
				projectIDs = append(projectIDs, pm.ProjectID)
			}
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	return projectIDs, nil
}

// IsMember reports whether the user belongs to the given project.
func (d *DB) IsMember(projectID, userID string) (bool, error) {
	var found bool
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketProjectMembers)
		key := projectID + ":" + userID
		if b.Get([]byte(key)) != nil {
			found = true
		}
		return nil
	})
	return found, err
}

// ---- Emails ----

// emailIndexKey builds a composite key using a reverse-timestamp layout so that
// cursor iteration returns emails in newest-first order.
func emailIndexKey(projectKey, emailID string, receivedAt time.Time) string {
	reverseNano := math.MaxInt64 - receivedAt.UnixNano()
	return fmt.Sprintf("%s:%020d:%s", projectKey, reverseNano, emailID)
}

// SaveEmail persists an email and inserts it into the project index.
func (d *DB) SaveEmail(e *domain.Email) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		be := tx.Bucket(bucketEmails)
		data, err := json.Marshal(e)
		if err != nil {
			return err
		}
		if err := be.Put([]byte(e.ID), data); err != nil {
			return err
		}

		bi := tx.Bucket(bucketEmailByProject)
		projectKey := e.ProjectID
		if projectKey == "" {
			projectKey = "__unassigned__"
		}
		return bi.Put([]byte(emailIndexKey(projectKey, e.ID, e.ReceivedAt)), []byte(""))
	})
}

// GetEmail retrieves an email by ID.
func (d *DB) GetEmail(id string) (*domain.Email, error) {
	var e domain.Email
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketEmails)
		v := b.Get([]byte(id))
		if v == nil {
			return ErrNotFound
		}
		return json.Unmarshal(v, &e)
	})
	if err != nil {
		return nil, err
	}
	return &e, nil
}

// ListEmailsByProject returns a paginated, newest-first list of active (non-trashed)
// emails for the given project.
func (d *DB) ListEmailsByProject(projectID string, page, pageSize int) ([]domain.Email, int, error) {
	if projectID == "" {
		projectID = "__unassigned__"
	}
	prefix := projectID + ":"

	var allIDs []string
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketEmailByProject)
		c := b.Cursor()
		for k, _ := c.Seek([]byte(prefix)); k != nil && strings.HasPrefix(string(k), prefix); k, _ = c.Next() {
			parts := strings.SplitN(string(k), ":", 3)
			switch len(parts) {
			case 3:
				allIDs = append(allIDs, parts[2])
			case 2:
				allIDs = append(allIDs, parts[1])
			}
		}
		return nil
	})
	if err != nil {
		return nil, 0, err
	}

	total := len(allIDs)

	start := (page - 1) * pageSize
	if start >= total {
		return []domain.Email{}, total, nil
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	pageIDs := allIDs[start:end]

	emails := make([]domain.Email, 0, len(pageIDs))
	err = d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketEmails)
		for _, id := range pageIDs {
			v := b.Get([]byte(id))
			if v == nil {
				continue
			}
			var e domain.Email
			if err := json.Unmarshal(v, &e); err != nil {
				return err
			}
			emails = append(emails, e)
		}
		return nil
	})
	if err != nil {
		return nil, 0, err
	}
	return emails, total, nil
}

// ListAllEmails returns a paginated, newest-first list of all emails regardless
// of project. Intended for admin views.
func (d *DB) ListAllEmails(page, pageSize int) ([]domain.Email, int, error) {
	allEmails := make([]domain.Email, 0)
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketEmails)
		return b.ForEach(func(k, v []byte) error {
			var e domain.Email
			if err := json.Unmarshal(v, &e); err != nil {
				return err
			}
			allEmails = append(allEmails, e)
			return nil
		})
	})
	if err != nil {
		return nil, 0, err
	}

	total := len(allEmails)
	// Sort newest first
	for i := 0; i < len(allEmails)-1; i++ {
		for j := i + 1; j < len(allEmails); j++ {
			if allEmails[i].ReceivedAt.Before(allEmails[j].ReceivedAt) {
				allEmails[i], allEmails[j] = allEmails[j], allEmails[i]
			}
		}
	}

	start := (page - 1) * pageSize
	if start >= total {
		return []domain.Email{}, total, nil
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	return allEmails[start:end], total, nil
}

// DeleteEmail permanently removes an email and its index entries.
func (d *DB) DeleteEmail(id string) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		be := tx.Bucket(bucketEmails)
		v := be.Get([]byte(id))
		if v == nil {
			return ErrNotFound
		}

		var e domain.Email
		if err := json.Unmarshal(v, &e); err != nil {
			return err
		}

		bi := tx.Bucket(bucketEmailByProject)
		projectKey := e.ProjectID
		if projectKey == "" {
			projectKey = "__unassigned__"
		}
		newKey := []byte(emailIndexKey(projectKey, id, e.ReceivedAt))
		if bi.Get(newKey) != nil {
			bi.Delete(newKey)
		} else {
			bi.Delete([]byte(projectKey + ":" + id))
		}

		return be.Delete([]byte(id))
	})
}

// SoftDeleteEmail marks an email as deleted and schedules it for automatic
// purge after 72 hours.
func (d *DB) SoftDeleteEmail(id string) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		be := tx.Bucket(bucketEmails)
		v := be.Get([]byte(id))
		if v == nil {
			return ErrNotFound
		}
		var e domain.Email
		if err := json.Unmarshal(v, &e); err != nil {
			return err
		}
		if e.DeletedAt != nil {
			return nil
		}
		now := time.Now()
		purge := now.Add(72 * time.Hour)
		e.DeletedAt = &now
		e.PurgeAt = &purge

		data, err := json.Marshal(e)
		if err != nil {
			return err
		}
		if err := be.Put([]byte(id), data); err != nil {
			return err
		}

		projectKey := e.ProjectID
		if projectKey == "" {
			projectKey = "__unassigned__"
		}
		indexKey := []byte(emailIndexKey(projectKey, id, e.ReceivedAt))
		bi := tx.Bucket(bucketEmailByProject)
		bi.Delete(indexKey)
		bt := tx.Bucket(bucketEmailTrash)
		return bt.Put(indexKey, []byte(""))
	})
}

// RestoreEmail reverses a soft-delete, moving the email back to the active index.
func (d *DB) RestoreEmail(id string) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		be := tx.Bucket(bucketEmails)
		v := be.Get([]byte(id))
		if v == nil {
			return ErrNotFound
		}
		var e domain.Email
		if err := json.Unmarshal(v, &e); err != nil {
			return err
		}
		if e.DeletedAt == nil {
			return nil
		}
		e.DeletedAt = nil
		e.PurgeAt = nil
		e.ProjectDeleted = false

		data, err := json.Marshal(e)
		if err != nil {
			return err
		}
		if err := be.Put([]byte(id), data); err != nil {
			return err
		}

		projectKey := e.ProjectID
		if projectKey == "" {
			projectKey = "__unassigned__"
		}
		indexKey := []byte(emailIndexKey(projectKey, id, e.ReceivedAt))
		bt := tx.Bucket(bucketEmailTrash)
		bt.Delete(indexKey)
		bi := tx.Bucket(bucketEmailByProject)
		return bi.Put(indexKey, []byte(""))
	})
}

// ListTrashedEmailsByProject returns a paginated list of soft-deleted emails
// for the given project.
func (d *DB) ListTrashedEmailsByProject(projectID string, page, pageSize int) ([]domain.Email, int, error) {
	if projectID == "" {
		projectID = "__unassigned__"
	}
	prefix := projectID + ":"

	var allIDs []string
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketEmailTrash)
		c := b.Cursor()
		for k, _ := c.Seek([]byte(prefix)); k != nil && strings.HasPrefix(string(k), prefix); k, _ = c.Next() {
			parts := strings.SplitN(string(k), ":", 3)
			switch len(parts) {
			case 3:
				allIDs = append(allIDs, parts[2])
			case 2:
				allIDs = append(allIDs, parts[1])
			}
		}
		return nil
	})
	if err != nil {
		return nil, 0, err
	}

	total := len(allIDs)
	start := (page - 1) * pageSize
	if start >= total {
		return []domain.Email{}, total, nil
	}
	end := start + pageSize
	if end > total {
		end = total
	}

	emails := make([]domain.Email, 0, end-start)
	err = d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketEmails)
		for _, eid := range allIDs[start:end] {
			v := b.Get([]byte(eid))
			if v == nil {
				continue
			}
			var e domain.Email
			if err := json.Unmarshal(v, &e); err != nil {
				return err
			}
			emails = append(emails, e)
		}
		return nil
	})
	return emails, total, err
}

// SoftDeleteEmailsByProject moves all active and trashed emails of the project
// into the trash bucket and marks them as project-deleted (no auto-purge timer).
func (d *DB) SoftDeleteEmailsByProject(projectID string) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		be := tx.Bucket(bucketEmails)
		bi := tx.Bucket(bucketEmailByProject)
		bt := tx.Bucket(bucketEmailTrash)
		now := time.Now()
		prefix := projectID + ":"

		var activeKeys [][]byte
		c := bi.Cursor()
		for k, _ := c.Seek([]byte(prefix)); k != nil && strings.HasPrefix(string(k), prefix); k, _ = c.Next() {
			cp := make([]byte, len(k))
			copy(cp, k)
			activeKeys = append(activeKeys, cp)
		}
		for _, key := range activeKeys {
			parts := strings.SplitN(string(key), ":", 3)
			var eid string
			switch len(parts) {
			case 3:
				eid = parts[2]
			case 2:
				eid = parts[1]
			default:
				continue
			}
			v := be.Get([]byte(eid))
			if v == nil {
				bi.Delete(key)
				continue
			}
			var e domain.Email
			if err := json.Unmarshal(v, &e); err != nil {
				continue
			}
			e.DeletedAt = &now
			e.PurgeAt = nil
			e.ProjectDeleted = true
			if data, err := json.Marshal(e); err == nil {
				be.Put([]byte(eid), data)
			}
			bi.Delete(key)
			bt.Put(key, []byte(""))
		}

		var trashKeys [][]byte
		c = bt.Cursor()
		for k, _ := c.Seek([]byte(prefix)); k != nil && strings.HasPrefix(string(k), prefix); k, _ = c.Next() {
			cp := make([]byte, len(k))
			copy(cp, k)
			trashKeys = append(trashKeys, cp)
		}
		for _, key := range trashKeys {
			parts := strings.SplitN(string(key), ":", 3)
			var eid string
			switch len(parts) {
			case 3:
				eid = parts[2]
			case 2:
				eid = parts[1]
			default:
				continue
			}
			v := be.Get([]byte(eid))
			if v == nil {
				bt.Delete(key)
				continue
			}
			var e domain.Email
			if err := json.Unmarshal(v, &e); err != nil {
				continue
			}
			e.PurgeAt = nil
			e.ProjectDeleted = true
			if e.DeletedAt == nil {
				e.DeletedAt = &now
			}
			if data, err := json.Marshal(e); err == nil {
				be.Put([]byte(eid), data)
			}
		}
		return nil
	})
}

// RestoreEmailsByProject reverses a project-level soft-delete, re-enabling the
// auto-purge timer for individually trashed emails.
func (d *DB) RestoreEmailsByProject(projectID string) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		be := tx.Bucket(bucketEmails)
		bt := tx.Bucket(bucketEmailTrash)
		purge := time.Now().Add(72 * time.Hour)
		prefix := projectID + ":"

		var trashKeys [][]byte
		c := bt.Cursor()
		for k, _ := c.Seek([]byte(prefix)); k != nil && strings.HasPrefix(string(k), prefix); k, _ = c.Next() {
			cp := make([]byte, len(k))
			copy(cp, k)
			trashKeys = append(trashKeys, cp)
		}
		for _, key := range trashKeys {
			parts := strings.SplitN(string(key), ":", 3)
			var eid string
			switch len(parts) {
			case 3:
				eid = parts[2]
			case 2:
				eid = parts[1]
			default:
				continue
			}
			v := be.Get([]byte(eid))
			if v == nil {
				bt.Delete(key)
				continue
			}
			var e domain.Email
			if err := json.Unmarshal(v, &e); err != nil {
				continue
			}
			if !e.ProjectDeleted {
				continue
			}
			e.PurgeAt = &purge
			e.ProjectDeleted = false
			if data, err := json.Marshal(e); err == nil {
				be.Put([]byte(eid), data)
			}
		}
		return nil
	})
}

// PurgeTrashedEmails permanently deletes all soft-deleted emails whose purge
// timestamp has passed. Returns the number of emails removed.
func (d *DB) PurgeTrashedEmails() (int, error) {
	now := time.Now()
	var toDelete []string
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketEmails)
		return b.ForEach(func(k, v []byte) error {
			var e domain.Email
			if err := json.Unmarshal(v, &e); err != nil {
				return nil
			}
			if e.DeletedAt == nil || e.ProjectDeleted {
				return nil
			}
			if e.PurgeAt != nil && e.PurgeAt.Before(now) {
				toDelete = append(toDelete, e.ID)
			}
			return nil
		})
	})
	if err != nil {
		return 0, err
	}
	deleted := 0
	for _, id := range toDelete {
		if err := d.hardDeleteEmail(id); err == nil {
			deleted++
		}
	}
	return deleted, nil
}

func (d *DB) hardDeleteEmail(id string) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		be := tx.Bucket(bucketEmails)
		v := be.Get([]byte(id))
		if v == nil {
			return ErrNotFound
		}
		var e domain.Email
		if err := json.Unmarshal(v, &e); err != nil {
			return err
		}
		projectKey := e.ProjectID
		if projectKey == "" {
			projectKey = "__unassigned__"
		}
		key := []byte(emailIndexKey(projectKey, id, e.ReceivedAt))
		tx.Bucket(bucketEmailByProject).Delete(key)
		tx.Bucket(bucketEmailTrash).Delete(key)
		return be.Delete([]byte(id))
	})
}

// PurgeProjectTrash permanently deletes all trashed emails belonging to the
// specified project.
func (d *DB) PurgeProjectTrash(projectID string) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		be := tx.Bucket(bucketEmails)
		bt := tx.Bucket(bucketEmailTrash)
		prefix := projectID + ":"

		var trashKeys [][]byte
		c := bt.Cursor()
		for k, _ := c.Seek([]byte(prefix)); k != nil && strings.HasPrefix(string(k), prefix); k, _ = c.Next() {
			cp := make([]byte, len(k))
			copy(cp, k)
			trashKeys = append(trashKeys, cp)
		}
		for _, key := range trashKeys {
			parts := strings.SplitN(string(key), ":", 3)
			var eid string
			switch len(parts) {
			case 3:
				eid = parts[2]
			case 2:
				eid = parts[1]
			default:
				continue
			}
			be.Delete([]byte(eid))
			bt.Delete(key)
		}
		return nil
	})
}

// SoftDeleteProject marks a project as deleted and cascades the soft-delete
// to all its emails.
func (d *DB) SoftDeleteProject(id string) error {
	p, err := d.GetProject(id)
	if err != nil {
		return err
	}
	now := time.Now()
	p.DeletedAt = &now
	if err := d.UpdateProject(p); err != nil {
		return err
	}
	return d.SoftDeleteEmailsByProject(id)
}

// RestoreProject reverses a project soft-delete and restores the associated
// emails to their previous trash state.
func (d *DB) RestoreProject(id string) error {
	p, err := d.GetProject(id)
	if err != nil {
		return err
	}
	if p.DeletedAt == nil {
		return nil
	}
	p.DeletedAt = nil
	if err := d.UpdateProject(p); err != nil {
		return err
	}
	return d.RestoreEmailsByProject(id)
}

// PurgeProject permanently removes a project along with all its members, emails,
// and index entries.
func (d *DB) PurgeProject(id string) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		bp := tx.Bucket(bucketProjects)
		if bp.Get([]byte(id)) == nil {
			return ErrNotFound
		}
		bp.Delete([]byte(id))

		bm := tx.Bucket(bucketProjectMembers)
		prefix := id + ":"
		var memberKeys [][]byte
		c := bm.Cursor()
		for k, _ := c.Seek([]byte(prefix)); k != nil && strings.HasPrefix(string(k), prefix); k, _ = c.Next() {
			cp := make([]byte, len(k))
			copy(cp, k)
			memberKeys = append(memberKeys, cp)
		}
		for _, k := range memberKeys {
			bm.Delete(k)
		}

		be := tx.Bucket(bucketEmails)
		bi := tx.Bucket(bucketEmailByProject)
		bt := tx.Bucket(bucketEmailTrash)
		emailIDs := make(map[string]struct{})

		for _, idx := range []*bolt.Bucket{bi, bt} {
			var keys [][]byte
			c := idx.Cursor()
			for k, _ := c.Seek([]byte(prefix)); k != nil && strings.HasPrefix(string(k), prefix); k, _ = c.Next() {
				cp := make([]byte, len(k))
				copy(cp, k)
				keys = append(keys, cp)
				parts := strings.SplitN(string(k), ":", 3)
				switch len(parts) {
				case 3:
					emailIDs[parts[2]] = struct{}{}
				case 2:
					emailIDs[parts[1]] = struct{}{}
				}
			}
			for _, k := range keys {
				idx.Delete(k)
			}
		}
		for eid := range emailIDs {
			be.Delete([]byte(eid))
		}
		return nil
	})
}

// ListTrashedProjects returns all projects that have been soft-deleted.
func (d *DB) ListTrashedProjects() ([]domain.Project, error) {
	projects := make([]domain.Project, 0)
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketProjects)
		return b.ForEach(func(k, v []byte) error {
			var p domain.Project
			if err := json.Unmarshal(v, &p); err != nil {
				return err
			}
			if p.DeletedAt != nil {
				projects = append(projects, p)
			}
			return nil
		})
	})
	return projects, err
}

// GetUnreadCounts returns a map from project ID to unread email count for the
// given user.
func (d *DB) GetUnreadCounts(userID string, projectIDs []string) (map[string]int, error) {
	counts := make(map[string]int, len(projectIDs))
	for _, pid := range projectIDs {
		counts[pid] = 0
	}

	err := d.bolt.View(func(tx *bolt.Tx) error {
		be := tx.Bucket(bucketEmails)
		bi := tx.Bucket(bucketEmailByProject)

		for _, projectID := range projectIDs {
			prefix := projectID + ":"
			c := bi.Cursor()
			for k, _ := c.Seek([]byte(prefix)); k != nil && strings.HasPrefix(string(k), prefix); k, _ = c.Next() {
				parts := strings.SplitN(string(k), ":", 3)
				var emailID string
				switch len(parts) {
				case 3:
					emailID = parts[2]
				case 2:
					emailID = parts[1]
				default:
					continue
				}
				v := be.Get([]byte(emailID))
				if v == nil {
					continue
				}
				var e domain.Email
				if err := json.Unmarshal(v, &e); err != nil {
					continue
				}
				isRead := false
				for _, uid := range e.ReadBy {
					if uid == userID {
						isRead = true
						break
					}
				}
				if !isRead {
					counts[projectID]++
				}
			}
		}
		return nil
	})
	return counts, err
}

// MarkRead adds the user to the email's read-by list, if not already present.
func (d *DB) MarkRead(userID, emailID string) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketEmails)
		v := b.Get([]byte(emailID))
		if v == nil {
			return ErrNotFound
		}
		var e domain.Email
		if err := json.Unmarshal(v, &e); err != nil {
			return err
		}

		for _, uid := range e.ReadBy {
			if uid == userID {
				return nil
			}
		}
		e.ReadBy = append(e.ReadBy, userID)

		data, err := json.Marshal(e)
		if err != nil {
			return err
		}
		return b.Put([]byte(emailID), data)
	})
}

// CleanExpiredFamilies deletes token families that are either invalidated or
// whose tokens have all expired.
func (d *DB) CleanExpiredFamilies() error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketTokenFamilies)
		var toDelete [][]byte
		err := b.ForEach(func(k, v []byte) error {
			var f domain.TokenFamily
			if err := json.Unmarshal(v, &f); err != nil {
				return nil
			}
			if f.Invalidated {
				toDelete = append(toDelete, k)
				return nil
			}
			allExpired := true
			for _, t := range f.Tokens {
				if time.Now().Before(t.ExpiresAt) {
					allExpired = false
					break
				}
			}
			if allExpired {
				toDelete = append(toDelete, k)
			}
			return nil
		})
		if err != nil {
			return err
		}
		for _, k := range toDelete {
			b.Delete(k)
		}
		return nil
	})
}

// IsRead reports whether the given user has read the specified email.
func (d *DB) IsRead(userID, emailID string) (bool, error) {
	var read bool
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketEmails)
		v := b.Get([]byte(emailID))
		if v == nil {
			return ErrNotFound
		}
		var e domain.Email
		if err := json.Unmarshal(v, &e); err != nil {
			return err
		}
		for _, uid := range e.ReadBy {
			if uid == userID {
				read = true
				return nil
			}
		}
		return nil
	})
	return read, err
}

// GetProjectStorageUsage returns the total byte size of all emails (active and
// trashed) belonging to the given project.
func (d *DB) GetProjectStorageUsage(projectID string) (int64, error) {
	if projectID == "" {
		projectID = "__unassigned__"
	}
	prefix := projectID + ":"
	var used int64

	err := d.bolt.View(func(tx *bolt.Tx) error {
		be := tx.Bucket(bucketEmails)
		bi := tx.Bucket(bucketEmailByProject)
		bt := tx.Bucket(bucketEmailTrash)
		seen := make(map[string]struct{})

		processIdx := func(idx *bolt.Bucket) {
			c := idx.Cursor()
			for k, _ := c.Seek([]byte(prefix)); k != nil && strings.HasPrefix(string(k), prefix); k, _ = c.Next() {
				parts := strings.SplitN(string(k), ":", 3)
				var eid string
				switch len(parts) {
				case 3:
					eid = parts[2]
				case 2:
					eid = parts[1]
				default:
					continue
				}
				if _, ok := seen[eid]; ok {
					continue
				}
				seen[eid] = struct{}{}
				v := be.Get([]byte(eid))
				if v == nil {
					continue
				}
				var e domain.Email
				if err := json.Unmarshal(v, &e); err != nil {
					continue
				}
				used += e.Size
			}
		}

		processIdx(bi)
		processIdx(bt)
		return nil
	})
	return used, err
}

// GetProjectTrashStats returns the count and total byte size of trashed emails
// for the given project.
func (d *DB) GetProjectTrashStats(projectID string) (count int, sizeBytes int64, err error) {
	if projectID == "" {
		projectID = "__unassigned__"
	}
	prefix := projectID + ":"
	err = d.bolt.View(func(tx *bolt.Tx) error {
		be := tx.Bucket(bucketEmails)
		bt := tx.Bucket(bucketEmailTrash)
		c := bt.Cursor()
		for k, _ := c.Seek([]byte(prefix)); k != nil && strings.HasPrefix(string(k), prefix); k, _ = c.Next() {
			parts := strings.SplitN(string(k), ":", 3)
			var eid string
			switch len(parts) {
			case 3:
				eid = parts[2]
			case 2:
				eid = parts[1]
			default:
				continue
			}
			v := be.Get([]byte(eid))
			if v == nil {
				continue
			}
			var e domain.Email
			if err2 := json.Unmarshal(v, &e); err2 != nil {
				continue
			}
			count++
			sizeBytes += e.Size
		}
		return nil
	})
	return
}

// ---- SMTP Relay Config ----

// GetSMTPConfig returns the persisted SMTP relay configuration.
func (d *DB) GetSMTPConfig() (*domain.SMTPRelayConfig, error) {
	var cfg domain.SMTPRelayConfig
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketSMTPConfig)
		v := b.Get([]byte("smtp"))
		if v == nil {
			return ErrNotFound
		}
		return json.Unmarshal(v, &cfg)
	})
	if err != nil {
		return nil, err
	}
	return &cfg, nil
}

// SaveSMTPConfig persists the SMTP relay configuration.
func (d *DB) SaveSMTPConfig(cfg *domain.SMTPRelayConfig) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketSMTPConfig)
		data, err := json.Marshal(cfg)
		if err != nil {
			return err
		}
		return b.Put([]byte("smtp"), data)
	})
}

// ---- Relay addresses per user ----

// GetRelayAddresses returns the saved relay recipient addresses for a user.
func (d *DB) GetRelayAddresses(userID string) ([]string, error) {
	var addrs []string
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketRelayAddresses)
		v := b.Get([]byte(userID))
		if v == nil {
			return nil
		}
		return json.Unmarshal(v, &addrs)
	})
	return addrs, err
}

// AddRelayAddress appends a new relay recipient address for the user, ignoring
// duplicates.
func (d *DB) AddRelayAddress(userID, addr string) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketRelayAddresses)
		var addrs []string
		if v := b.Get([]byte(userID)); v != nil {
			_ = json.Unmarshal(v, &addrs)
		}
		for _, a := range addrs {
			if a == addr {
				return nil
			}
		}
		addrs = append(addrs, addr)
		data, err := json.Marshal(addrs)
		if err != nil {
			return err
		}
		return b.Put([]byte(userID), data)
	})
}

// DeleteRelayAddress removes a specific relay recipient address from the user's list.
func (d *DB) DeleteRelayAddress(userID, addr string) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketRelayAddresses)
		var addrs []string
		if v := b.Get([]byte(userID)); v != nil {
			_ = json.Unmarshal(v, &addrs)
		}
		filtered := addrs[:0]
		for _, a := range addrs {
			if a != addr {
				filtered = append(filtered, a)
			}
		}
		data, err := json.Marshal(filtered)
		if err != nil {
			return err
		}
		return b.Put([]byte(userID), data)
	})
}
