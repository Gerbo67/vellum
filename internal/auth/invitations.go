package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/loomtek/vellum/internal/domain"
	"github.com/loomtek/vellum/internal/storage"
)

const invitationTTL = 48 * time.Hour

var (
	ErrInvitationNotFound = errors.New("invitation not found")
	ErrInvitationExpired  = errors.New("invitation expired")
	ErrInvitationUsed     = errors.New("invitation already used")
)

// CreateInvitation generates a new time-limited invitation link for a pending user.
// If the user already has an invitation it is renewed.
func (s *Service) CreateInvitation(userID string) (*domain.Invitation, error) {
	token, err := generateToken()
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	now := time.Now()

	// Check for existing invitation (renew it).
	existing, err := s.db.GetInvitationByUser(userID)
	if err != nil && !errors.Is(err, storage.ErrNotFound) {
		return nil, err
	}
	if existing != nil {
		renewedAt := now
		existing.Token = token
		existing.ExpiresAt = now.Add(invitationTTL)
		existing.RenewedAt = &renewedAt
		existing.UsedAt = nil
		if err := s.db.UpdateInvitation(existing); err != nil {
			return nil, err
		}
		return existing, nil
	}

	inv := &domain.Invitation{
		ID:        uuid.NewString(),
		UserID:    userID,
		Token:     token,
		ExpiresAt: now.Add(invitationTTL),
		CreatedAt: now,
	}
	if err := s.db.CreateInvitation(inv); err != nil {
		return nil, err
	}
	return inv, nil
}

// ValidateInvitation checks that a token is valid (exists, not expired, not used).
func (s *Service) ValidateInvitation(token string) (*domain.Invitation, error) {
	inv, err := s.db.GetInvitationByToken(token)
	if errors.Is(err, storage.ErrNotFound) {
		return nil, ErrInvitationNotFound
	}
	if err != nil {
		return nil, err
	}
	if inv.UsedAt != nil {
		return nil, ErrInvitationUsed
	}
	if time.Now().After(inv.ExpiresAt) {
		return nil, ErrInvitationExpired
	}
	return inv, nil
}

// AcceptInvitation sets the user's password, activates the account, and marks
// the invitation as used. Returns the user so the caller can issue a session.
func (s *Service) AcceptInvitation(token, password string) (*domain.User, error) {
	inv, err := s.ValidateInvitation(token)
	if err != nil {
		return nil, err
	}

	u, err := s.db.GetUserByID(inv.UserID)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	if err := s.SetLocalPassword(u.ID, password); err != nil {
		return nil, err
	}

	u.Status = domain.UserStatusActive
	u.UpdatedAt = time.Now()
	if err := s.db.UpdateUser(u); err != nil {
		return nil, err
	}

	now := time.Now()
	inv.UsedAt = &now
	_ = s.db.UpdateInvitation(inv)

	return u, nil
}

// ListInvitations returns all invitations with their current status.
func (s *Service) ListInvitations() ([]domain.Invitation, error) {
	return s.db.ListInvitations()
}

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
