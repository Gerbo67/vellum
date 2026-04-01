# SMTP Relay {#top}

The SMTP Relay is the feature that allows forwarding emails captured by Vellum to real recipients using an external SMTP server. Without this configuration, Vellum only receives and stores emails. With it, any stored email can be sent to a real address with a single click.

## Who configures it {#who-configures}

Only an administrator can configure the SMTP Relay. The configuration is found in the administration section of the sidebar, under **SMTP Relay**. If the relay is not configured and a user attempts to forward an email, Vellum indicates that the administrator must be contacted.

Regular users can:

- Use the forward button on any stored email.
- Manage their list of saved addresses for quick forwarding.

Regular users cannot view or modify the SMTP server credentials.

## Configuration parameters {#parameters}

| Field        | Description                                                                              |
|--------------|------------------------------------------------------------------------------------------|
| Server       | SMTP server address (for example, `smtp.sendgrid.net`)                                   |
| Port         | Connection port. With STARTTLS it is 587; with direct TLS (SMTPS), 465                  |
| Username     | Authentication username on the external SMTP server                                      |
| Password     | Authentication password. Stored encrypted and never shown in plain text                 |
| From address | Address that will appear as the sender on the forwarded message                         |
| Direct TLS   | If enabled, Vellum connects via TLS from the start. If not, it negotiates STARTTLS if the server offers it |
| Relay enabled | Main switch. The relay only works if this is active                                    |

The **from address** is required. It will be the sender on all forwarded emails, regardless of who the original sender is in Vellum.

## How forwarding works {#how-it-works}

When the relay is enabled, each email in the message list shows a forward button. Clicking it opens a dialog where the user chooses the recipient. Vellum builds a MIME message with the subject, HTML body, and plain text body of the original email and sends it to the configured SMTP server.

The connection process follows these steps:

1. Vellum opens a TCP connection to the SMTP server at the configured host and port.
2. If **Direct TLS** is enabled, the connection is established via TLS from the start.
3. If not, Vellum negotiates STARTTLS if the server offers it.
4. If credentials are configured, it authenticates with PLAIN auth over the encrypted connection.
5. The message is sent using standard SMTP commands (`MAIL FROM`, `RCPT TO`, `DATA`).

The **Test connection** function on the configuration screen verifies that Vellum can connect and authenticate without sending any email.

## Saved addresses per user {#saved-addresses}

Vellum stores a forwarding history per user. When a user forwards an email to an address for the first time, that address is saved in their profile. On subsequent forwards, they can select it from the list without having to type it again.

Saved addresses are private per user; each user manages their own independently.

From the forward dialog you can:

- Select a saved address.
- Type a new address (which will be saved automatically on send).
- Delete a saved address from the address manager.

If the relay is not configured when a user attempts to forward an email, Vellum displays a notice indicating that the administrator must be contacted for configuration.
