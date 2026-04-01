package storage

import (
	"encoding/json"

	"github.com/loomtek/vellum/internal/domain"
	bolt "go.etcd.io/bbolt"
)

// CreateInvitation persists a new invitation and indexes it by token and userID.
func (d *DB) CreateInvitation(inv *domain.Invitation) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		bMain := tx.Bucket(bucketInvitations)
		bByToken := tx.Bucket(bucketInvitationByToken)
		bByUser := tx.Bucket(bucketInvitationByUser)

		data, err := json.Marshal(inv)
		if err != nil {
			return err
		}
		if err := bMain.Put([]byte(inv.ID), data); err != nil {
			return err
		}
		if err := bByToken.Put([]byte(inv.Token), []byte(inv.ID)); err != nil {
			return err
		}
		return bByUser.Put([]byte(inv.UserID), []byte(inv.ID))
	})
}

// GetInvitationByToken retrieves an invitation by its random token.
func (d *DB) GetInvitationByToken(token string) (*domain.Invitation, error) {
	var inv domain.Invitation
	err := d.bolt.View(func(tx *bolt.Tx) error {
		bByToken := tx.Bucket(bucketInvitationByToken)
		idBytes := bByToken.Get([]byte(token))
		if idBytes == nil {
			return ErrNotFound
		}
		bMain := tx.Bucket(bucketInvitations)
		v := bMain.Get(idBytes)
		if v == nil {
			return ErrNotFound
		}
		return json.Unmarshal(v, &inv)
	})
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

// GetInvitationByUser retrieves the current invitation for a user (one per user).
func (d *DB) GetInvitationByUser(userID string) (*domain.Invitation, error) {
	var inv domain.Invitation
	err := d.bolt.View(func(tx *bolt.Tx) error {
		bByUser := tx.Bucket(bucketInvitationByUser)
		idBytes := bByUser.Get([]byte(userID))
		if idBytes == nil {
			return ErrNotFound
		}
		bMain := tx.Bucket(bucketInvitations)
		v := bMain.Get(idBytes)
		if v == nil {
			return ErrNotFound
		}
		return json.Unmarshal(v, &inv)
	})
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

// UpdateInvitation persists changes to an existing invitation (renew / mark used).
// The token index is updated if the token changed (renew case).
func (d *DB) UpdateInvitation(inv *domain.Invitation) error {
	return d.bolt.Update(func(tx *bolt.Tx) error {
		bMain := tx.Bucket(bucketInvitations)
		bByToken := tx.Bucket(bucketInvitationByToken)

		existing := bMain.Get([]byte(inv.ID))
		if existing == nil {
			return ErrNotFound
		}
		var old domain.Invitation
		if err := json.Unmarshal(existing, &old); err != nil {
			return err
		}
		// Remove old token index entry if the token was rotated (renew).
		if old.Token != inv.Token {
			bByToken.Delete([]byte(old.Token))
			if err := bByToken.Put([]byte(inv.Token), []byte(inv.ID)); err != nil {
				return err
			}
		}
		data, err := json.Marshal(inv)
		if err != nil {
			return err
		}
		return bMain.Put([]byte(inv.ID), data)
	})
}

// ListInvitations returns all stored invitations, ordered by creation time
// (bbolt stores keys in byte-sorted order; UUIDs are not time-sorted, so we
// return them unordered and let the caller sort if needed).
func (d *DB) ListInvitations() ([]domain.Invitation, error) {
	var result []domain.Invitation
	err := d.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketInvitations)
		return b.ForEach(func(_, v []byte) error {
			var inv domain.Invitation
			if err := json.Unmarshal(v, &inv); err != nil {
				return err
			}
			result = append(result, inv)
			return nil
		})
	})
	return result, err
}
