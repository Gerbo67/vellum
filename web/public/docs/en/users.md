# Users {#top}

The users screen is exclusive to administrators. It lets you view all registered accounts in the Vellum instance and control who has active access to the system.

## Overview {#overview}

Each row shows the basic account information:

- **Name and email** of the registered user.
- **Registration date**.
- **Role** — `admin` or `user`. There is only one role per account; the first person to register gets the administrator role.
- **Provider** — `local` if the user registered with email and password, or the OIDC provider name if they authenticated via SSO.
- **Status** — inactive users appear with a visible badge. An inactive user cannot sign in.

## Activating and deactivating {#activation}

The button next to each user toggles between active and inactive. This action is immediate and reversible: a deactivated user loses access instantly without needing to delete the account. Access can be restored by activating them again.

An administrator cannot deactivate their own account from this screen.

## Deleting users {#deletion}

The delete button permanently removes the account. Confirmation is required before the action is executed. Deletion cannot be undone.

An administrator cannot delete their own account from this screen.

## Roles {#roles}

Roles are informational in this view; they cannot be changed from the interface. The system supports two roles:

- **admin** — full access: users, projects, SMTP configuration, and emails from all projects they belong to.
- **user** — access only to emails from the projects they have been assigned to.

The administrator role is automatically assigned to the first user who registers in a new Vellum instance.
