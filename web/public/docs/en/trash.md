# Trash {#top}

When an email is deleted in Vellum, it does not disappear immediately. It enters the project trash and stays there for **3 days**. After that period, an internal process removes it permanently without manual intervention.

The same applies to projects: when an administrator deletes one, it enters a pending deletion state and can be restored. If permanently deleted, all content is gone.

## Per-project trash {#project-trash}

Each project has its own trash, accessible from the trash icon in the inbox header. From there you can:

- **View deleted emails** sorted by received date.
- **Restore emails** individually or by selecting multiple at once.
- **Delete permanently** a single email before its period expires.
- **Empty the trash** for the entire project at once.

Emails show how many days remain before permanent deletion. When less than 24 hours remain, they show "Expires today".

## Email trash states {#states}

A trashed email can be in one of two states:

| State | Description |
|-------|-------------|
| In trash | Deleted by a user or admin. Expires 3 days from deletion. |
| Project deleted | The project it belongs to was deleted. No active timer until the project is restored or permanently purged. |

Emails in "Project deleted" state cannot be restored individually while the project is in the trash. They are only restored when the project itself is restored.

## Project trash {#admin-trash}

Only administrators can delete projects. When a project is deleted:

1. The project enters the trash in the admin projects section.
2. All its active emails move to "Project deleted" state and suspend their timer.
3. Emails already in the project trash also have their timer suspended.

In the **Projects** admin section, deleted projects appear at the bottom of the list. Each shows the deletion date and two available actions:

### Restore a project

When a project is restored:

- The project reappears in the sidebar and inbox for its members.
- All emails in "Project deleted" state receive a fresh **3-day** timer starting from the moment of restoration.
- Active emails that were not deleted remain active.

### Permanently delete a project

When a project is purged from the trash, the following are permanently and irrecoverably deleted:

- The project and its configuration.
- All its senders.
- All its members.
- All its emails, both active and trashed.

This action requires explicit confirmation before executing.

## Automatic purge job {#purge-job}

Vellum runs an internal process every hour that permanently deletes emails whose 3-day period has expired. The process only acts on trashed emails with an active timer; emails in "Project deleted" state are not affected until a decision is made about their project.

There is no notification when the automatic purge runs. Emails simply cease to exist.

## Note on data retention {#disclaimer}

Vellum is a development tool, not a data retention audit system. Its purpose is to capture outbound emails during development and QA so teams can inspect them without reaching real recipients.

The trash exists to provide a correction window for accidental deletions, not as a retention guarantee. Once the period expires or a manual purge is executed, data is gone with no possibility of recovery. Vellum does not keep email backups.

If your use case requires retaining emails as evidence or complying with audit requirements, Vellum is not the right tool.

