# Projects {#top}

A project is the central organizational unit in Vellum. It groups emails under a name, controls which sending addresses belong to it, and defines which users can see them. Only administrators can create projects and manage their membership.

## What Vellum is for in a team {#use-case}

Vellum is designed to run as a shared SMTP server within a team or company, accessible from the internet or an internal network. The idea is to point the mail domains of development and QA environments to the Vellum instance: any email the application sends arrives at Vellum instead of going out to the internet.

Each team or project has its own isolated space. Users only see the emails of the projects they belong to. This lets multiple teams share the same instance without seeing each other's email flows.

For individual or local use, tools like Mailpit are more lightweight and require no authentication. Vellum adds value when you need a centralized server with users, projects, and controlled access.

## Senders {#senders}

Each project has a list of **senders**: the email addresses whose domain points to Vellum. When an application sends an email, the `From` or `Return-Path` field of the message determines which project it belongs to.

If the sender of the incoming email matches one of those configured in a project, the email is assigned to that project and becomes visible to its members. If it does not match any project, the email is received by Vellum but does not appear in any inbox — no user will see it.

Senders are configured as a comma-separated list of addresses:

```
support@company.dev, notifications@company.dev, noreply@qa.company.com
```

The comparison is case-insensitive.

## Creating and editing projects {#create-edit}

Only the administrator can create projects. The available fields are:

| Field       | Description                                                                     |
|-------------|---------------------------------------------------------------------------------|
| Name        | Project name. Required.                                                         |
| Description | Optional free text to identify the project's purpose.                          |
| Senders     | Comma-separated list of email addresses that route to this project.             |

A project can exist without senders, but it will not receive any emails until at least one is configured. A project can have as many senders as needed.

## Members {#members}

Each project has a member list: the users who can view its emails. The administrator manages membership from the members button on each project.

From that dialog you can:

- **View current members** and remove any of them.
- **Add users** who are not yet in the project.

A user can belong to multiple projects simultaneously. When a user accesses Vellum, the sidebar shows only the projects they belong to.

Administrators have global access and can see all projects without needing to be explicit members.

## Deleting projects {#deletion}

When a project is deleted, its configuration and membership are permanently removed. Associated emails remain in the database but are left without an assigned project. The action requires confirmation before it is executed.

## Storage quota {#storage-quota}

Each project can have a storage limit set by the administrator. By default there is no limit: the project can receive emails without any space restriction.

### How it is configured {#quota-config}

The administrator sets the limit when creating or editing a project, using the **Storage** field. The value is expressed in megabytes (MB). Leaving it empty or set to 0 means unlimited.

Once configured, each card in the project administration screen shows:

- The space used and the limit in a readable format (`2.4 MB of 100 MB`).
- A progress bar that changes color: blue under normal use, amber above 80%, and red when the limit is reached or exceeded.
- The **Quota exceeded** badge when the project has hit its limit.

### What happens when it fills up {#quota-full}

If the project has reached its quota, the SMTP server rejects incoming emails with the standard error **552 — Insufficient storage**. The application trying to send the email will receive that code and, depending on its configuration, will retry or log it as a failure.

Space is only freed in two ways:

- Emails in the trash are permanently deleted when their 3-day window expires.
- The administrator manually empties the project's trash.

Restoring emails from trash back to the inbox does not free space: the email was already counting toward the quota while it was in the trash.

### What counts toward the quota {#what-counts}

All emails in the project are counted — both those active in the inbox and those in the trash pending expiry. The quota reflects the real disk space that project occupies in Vellum.

