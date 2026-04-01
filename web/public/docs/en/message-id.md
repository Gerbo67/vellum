# Message-ID and conversation threads {#top}

The `Message-ID` is a unique identifier that every email carries in its header. It is defined by RFC 2822 and its standard format is a string delimited by angle brackets with a local part and a domain: `<local@domain>`. When an application sends an email, it is responsible for generating that identifier. If it does not include one, the receiving SMTP server typically assigns it.

In Vellum, `Message-ID` is the foundation on which **conversation threads** are built: groups of related emails displayed as a single entry in the inbox list.

## The three threading headers {#threading-headers}

The email standard defines three headers that allow messages to be related to each other. All three work together so that any mail client — or Vellum — can reconstruct the complete tree of a conversation.

### Message-ID {#message-id-header}

Uniquely identifies that email. It must be globally unique: no other email on any server should have the same value.

```
Message-ID: <1682544012.abc123@app.yourdomain.com>
```

The local part (before the `@`) is typically a combination of a timestamp and a random token. The domain part anchors the identifier to whoever issued it.

### In-Reply-To {#in-reply-to}

Contains the `Message-ID` of the email this message is replying to. It is the direct reference to the immediate parent in the thread. Without this header, mail clients cannot automatically determine which message this is a reply to.

```
In-Reply-To: <1682544012.abc123@app.yourdomain.com>
```

### References {#references}

Contains the full chain of `Message-ID`s from all ancestor messages, in chronological order and separated by spaces. It allows the complete thread tree to be reconstructed even if an intermediate message is unavailable or arrived out of order.

```
References: <root@domain.com> <reply1@domain.com> <reply2@domain.com>
```

Each time a reply is sent, the `References` field is built by taking the parent message's `References` and appending its `Message-ID` at the end.

## How Vellum groups threads {#how-vellum-groups}

Vellum reads the `In-Reply-To` and `References` headers of each received email and uses a union algorithm to detect which messages belong to the same conversation. Related messages are grouped in the inbox list as a single thread entry showing the number of emails it contains.

The specific behavior is as follows:

- A thread with a single email is displayed the same as an individual email.
- A thread with multiple emails shows the list of unique senders, the subject of the first email, the date of the most recent one, and a counter with the total number of messages.
- The color indicator on the left border marks the thread as unread if any of its emails have not yet been opened.
- Clicking a thread expands it to show the individual emails it contains. Each one shows its sender and date. Clicking an email within the thread opens it in the detail panel.

### Tolerance for duplicate Message-IDs {#duplicate-tolerance}

Vellum also groups emails that share the same `Message-ID`. This is common in development environments when an application resends the same email without generating a new identifier. Rather than rejecting them or showing them as independent emails, Vellum incorporates them into the same thread.

### Selection mode {#select-mode}

In batch selection mode, clicking a thread marks or unmarks all its emails at once. If only some emails in the thread are selected, the thread checkbox shows an indeterminate state. Emails within an expanded thread can be selected individually.

## Recommendations {#recommendations}

### Generate a unique Message-ID per send {#unique-per-send}

Uniqueness is the fundamental property of `Message-ID`. The most robust format combines a timestamp in milliseconds or microseconds, a random token, and the application domain:

```
<1682544012550.f3a9c1b2@app.yourdomain.com>
```

Most **email client libraries** generate this identifier automatically if one is not specified. It is important to understand that the entity responsible for generating the `Message-ID` is the library that builds the message — not the receiving SMTP server or the sending provider. The server only relays what it receives; if a message arrives without a `Message-ID`, some servers will add one, but this behavior is not guaranteed and varies across providers.

The following libraries generate it automatically on send:

| Language    | Library                                   | Generates Message-ID automatically?         |
|-------------|-------------------------------------------|----------------------------------------------|
| Node.js     | **Nodemailer**                            | Yes, unless one is explicitly provided       |
| PHP         | **PHPMailer**                             | Yes, via `PHPMailer::generateId()`           |
| PHP         | **Symfony Mailer**                        | Yes, added at send time                      |
| PHP         | **Laravel Mail** (via Symfony Mailer)     | Yes, inherited from Symfony Mailer           |
| Python      | **Django** (`django.core.mail`)           | Yes, inserted automatically                  |
| Python      | `email` stdlib + `smtplib`               | No — use `email.utils.make_msgid()` manually |
| .NET / C#   | **MimeKit / MailKit**                     | No by default — use `MimeUtils.GenerateMessageId()` and assign it to `message.MessageId` |
| Go          | **gomail**                                | Yes, generated on `Send()`                   |
| Go          | `net/smtp` stdlib                        | No — you must include it in headers manually |
| Ruby        | **ActionMailer** (Rails)                  | Yes, added as part of the message            |
| Java        | **Jakarta Mail** (formerly JavaMail)      | No — set it manually and call `message.saveChanges()` |

It is worth checking the exact behavior of the library version you use, as some change this behavior between major versions. The quickest way to verify is to inspect an email sent through Vellum and check the `Message-ID` header in the **Code** tab.

### Use a real domain in the Message-ID {#use-real-domain}

The part after the `@` must be the domain of your application or mail server, not `localhost`, `127.0.0.1`, or an IP address. Spam filters verify consistency between the `Message-ID` domain and the sender domain. A `Message-ID` with `localhost` will not block delivery in most cases, but it does generate negative signals in reputation evaluations.

### Include References in automated replies {#include-references}

If your application sends emails in a chain — follow-up notifications, ticket updates, staggered reminders — include both `In-Reply-To` and `References` with the complete ancestor chain. This allows mail clients and Vellum to reconstruct the full thread even if messages arrive out of order or across different load pages.

An example of a third message in a three-message chain:

```
Message-ID: <third@app.domain.com>
In-Reply-To: <second@app.domain.com>
References: <first@app.domain.com> <second@app.domain.com>
```

### Do not reuse Message-IDs in tests {#no-reuse-in-tests}

The most frequent mistake in development environments is generating the same `Message-ID` for different emails due to simplified test code (a static UUID, a fixed value, a counter that resets). This causes Vellum to group unrelated emails in the same thread, making it difficult to identify which email came from which flow. Generate a new identifier for each email sent, even when testing the same template multiple times.

### Do not confuse Message-ID with your system's internal ID {#dont-confuse-ids}

`Message-ID` is an email protocol standard, not your database primary key. Both coexist with different purposes: `Message-ID` is understood by mail servers, mail clients, and Vellum; the internal ID is only understood by your application. In Vellum, the storage identifier is independent of the `Message-ID` received in the header.

### When not to worry about Message-ID {#when-not-to-worry}

If your application sends independent transactional emails — registration confirmations, invoices, one-off alerts — and there is no semantic relationship between them, there is no need to manage `In-Reply-To` or `References`. Each email is a complete message on its own and Vellum will show it as a separate entry in the list.

`Message-ID` becomes relevant when emails form part of a sequence: a ticketing system, a staggered follow-up campaign, a notification with a subsequent confirmation. In those cases, thread traceability has value both for the developer and for anyone analyzing the behavior of the mail system.


