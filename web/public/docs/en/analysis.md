# Email analysis {#top}

Vellum is an SMTP development and testing server. It receives emails sent from any application, stores them, and displays them in a web interface where they can be inspected, analyzed, and forwarded. It does not deliver messages to real recipients unless an explicit SMTP relay is configured.

When Vellum receives an email, it runs an automatic analysis on its content, headers, and structure. The result is a set of checks grouped into six categories. Each check has a severity level and a numeric impact that determines how many points are deducted from the total.

There are three severity levels:

- **blocker** — compromises delivery or security. Its presence almost guarantees the email will be rejected or filtered.
- **warning** — a problem that affects deliverability or compatibility under real conditions.
- **info** — a recommended improvement that does not block delivery but does reduce message quality.

## Score and grade {#scoring}

The analysis starts at 100 points. For each failing check, the corresponding impact value is subtracted. The final score cannot go below zero.

| Score    | Grade |
|----------|-------|
| 95 – 100 | A+    |
| 88 – 94  | A     |
| 78 – 87  | B     |
| 65 – 77  | C     |
| 45 – 64  | D     |
| 0 – 44   | F     |

If any **blocker** check fails, the grade is automatically lowered by one level, regardless of the numeric score.

**Vellum Verified** is an additional distinction awarded when the email passes all critical checks with no failed blockers. It indicates the message is technically well-constructed and ready for production environments.

## Security {#security}

Security checks detect patterns in the email's HTML that mail providers remove, block, or use as phishing or malware signals. If the email has no HTML body, all checks in this category are automatically skipped.

### No `<script>` tags {#no_script_tags}

**Severity:** blocker — **Impact:** 20 points

Email clients do not execute JavaScript. Gmail, Outlook, and Apple Mail strip any `<script>` tag before rendering the message; some providers reject the entire email if scripts are detected. Including JavaScript in an HTML email has no functional effect and triggers security filters.

### No `javascript:` URLs {#no_javascript_urls}

**Severity:** blocker — **Impact:** 20 points

`href`, `src`, and `action` attributes containing `javascript:` as the protocol are blocked by all email clients. Besides not working, they are a direct signal of an attempt to execute arbitrary code. Anti-phishing filters identify them immediately.

### No inline event handlers {#no_event_handlers}

**Severity:** warning — **Impact:** 12 points

Attributes like `onclick`, `onload`, `onerror`, and similar are silently removed by email clients before rendering the message. Code that depends on them will not execute. Additionally, their presence is interpreted by some filters as suspicious behavior.

### No iframe, object, or embed tags {#no_dangerous_tags}

**Severity:** blocker — **Impact:** 12 points

`<iframe>`, `<object>`, and `<embed>` tags are completely removed by Gmail, Outlook, and all major providers. They are used in known attack vectors to inject external content or execute code. No email client renders them.

### No CSS `expression()` {#no_css_expression}

**Severity:** blocker — **Impact:** 15 points

`expression()` is an Internet Explorer CSS construct that allows running JavaScript from inside a stylesheet. No modern browser supports it, but it is still actively detected by anti-spam filters as an attack vector. Its presence triggers immediate blocks in most providers.

### No `data:` URLs with executable code {#no_data_js_urls}

**Severity:** blocker — **Impact:** 15 points

URLs with the `data:text/html` or `data:application/javascript` scheme in `src` or `href` attributes are blocked by all modern security filters. They are used to embed executable content without going through an external server, making them a mechanism for evading domain-based filters.

### No forms with actions pointing to external domains {#no_external_form}

**Severity:** warning — **Impact:** 6 points

A `<form>` element whose `action` attribute points to an external URL is treated as a phishing signal by Gmail and Outlook. The typical goal of this pattern is to collect user data when a button inside the email is clicked.

### No direct links to IP addresses {#no_ip_links}

**Severity:** warning — **Impact:** 8 points

Links pointing directly to an IP address (for example `http://192.168.1.1/path`) are systematically blocked by anti-spam and anti-phishing filters. Legitimate emails use domain names. An IP in a link is a signal of an attempt to bypass domain reputation.

## Client compatibility {#compatibility}

This category checks that the email's HTML does not use CSS features or structures that email clients do not support. Outlook is the most critical case: its rendering engine is Word, not a browser, and it has severe limitations with modern CSS.

### No CSS Flexbox {#no_flexbox}

**Severity:** warning — **Impact:** 6 points

`display: flex` and `display: inline-flex` are not supported in Outlook 2007 through 2019. Flexbox-based layouts will break completely in those versions. For Outlook-compatible emails, layout must be built with HTML tables.

### No CSS Grid {#no_grid}

**Severity:** warning — **Impact:** 6 points

CSS Grid is not supported in Outlook or most desktop email clients. Using it produces incorrect layouts or no visible structure.

### No CSS variables {#no_css_vars}

**Severity:** info — **Impact:** 3 points

CSS custom properties (`var(--name)`) are not supported in Outlook or several webmail clients. Values that depend on them simply don't apply, which can affect colors, sizes, or spacing.

### No `@font-face` {#no_font_face}

**Severity:** info — **Impact:** 3 points

Only Gmail and Apple Mail support web fonts loaded with `@font-face`. Other clients ignore the declaration and use the first available `font-family` fallback. If that fallback is not explicitly defined, the client chooses its own generic typeface.

### No `@import` in CSS {#no_css_import}

**Severity:** warning — **Impact:** 4 points

Email clients ignore stylesheets imported with `@import`. Rules defined in those external sheets are not applied, and the email may be missing expected styles. All styles must be included directly in the HTML document.

### No external stylesheets {#no_external_css}

**Severity:** warning — **Impact:** 7 points

`<link rel="stylesheet">` tags pointing to external stylesheets are blocked by email clients for security and privacy reasons. CSS must be embedded directly in the email's HTML.

### No `position: fixed` {#no_position_fixed}

**Severity:** info — **Impact:** 3 points

`position: fixed` is not supported in most email clients. Depending on the client, it may cause an element to become invisible, hide other content, or generate unpredictable layout behavior.

### DOCTYPE present {#has_doctype}

**Severity:** info — **Impact:** 3 points

Without the `<!DOCTYPE html>` declaration, email clients activate quirks rendering mode, which applies legacy compatibility rules from 90s browsers. This can distort the layout, alter the box model, and change the behavior of several CSS elements.

### Character encoding declared {#has_charset}

**Severity:** warning — **Impact:** 4 points

Without a charset declaration (`<meta charset="UTF-8">` or equivalent), email clients may interpret the text encoding incorrectly. The visible result is corrupted special characters: accents, special letters, or symbols displayed as unreadable sequences.

## RFC structure and headers {#structure}

This category checks that the email complies with the standards defined in email RFCs (mainly RFC 2822 and RFC 5322). Malformed or missing headers can cause the email to be rejected before reaching the inbox.

### HTML version present {#has_html_body}

**Severity:** warning — **Impact:** 8 points

An email without an HTML body has very limited formatting. Plain-text emails can appear automated or unprofessional depending on context.

### Plain text version present {#has_text_body}

**Severity:** warning — **Impact:** 8 points

Plain text is the fallback for clients that do not render HTML and for anti-spam filters. An email without a plain text version loses points in the deliverability evaluation of several providers.

### Plain text with real content {#text_body_content}

**Severity:** warning — **Impact:** 5 points

An empty plain text body, or one with only whitespace, is worse than not having one. Anti-spam filters interpret it as an evasion attempt: an email with extensive HTML and empty plain text is suspicious.

### Non-empty subject {#has_subject}

**Severity:** warning — **Impact:** 6 points

An email without a subject is heavily penalized by anti-spam filters. Additionally, in most clients it appears as "(no subject)", which drastically reduces the open rate.

### Appropriate subject length {#subject_length}

**Severity:** info — **Impact:** 3 points

The optimal range for the subject line is between 6 and 78 characters. Above 78, Gmail, Outlook, and mobile clients will truncate it. Subject lines of 40 to 60 characters perform best on mobile devices.

### Date header present {#has_date}

**Severity:** warning — **Impact:** 5 points

The `Date` header is mandatory per RFC 2822. Its absence generates distrust in anti-spam filters because legitimate emails always have a date.

### Message-ID present {#has_message_id}

**Severity:** blocker — **Impact:** 10 points

The `Message-ID` is a unique email identifier defined in RFC 5322 and is required. Its absence triggers anti-spam filters in most providers. It is also necessary for email clients to correctly manage conversation threads.

### No duplicate singular headers {#unique_headers}

**Severity:** warning — **Impact:** 6 points

RFC 5322 specifies that headers like `From`, `Subject`, `Date`, or `Message-ID` may only appear once. A message with these headers duplicated is malformed and anti-spam filters penalize it.

### Sender with display name {#has_from_name}

**Severity:** warning — **Impact:** 5 points

The `From` field can contain just the address or the address with a display name (`Acme Team <info@acme.com>`). Including a name improves the open rate and reduces the likelihood of the email being marked as spam.

### From field with a single address {#single_from_address}

**Severity:** blocker — **Impact:** 8 points

RFC 5322 requires the `From` field to contain exactly one author address. Multiple addresses in `From` produce a malformed message that providers may reject.

## Deliverability {#deliverability}

This category evaluates factors that determine whether the email will reach the inbox or end up in spam. It combines analysis of the subject line, HTML, and attachments.

### Content without spam indicators {#no_spam_triggers}

**Severity:** warning — **Impact:** 8 points

This check is run by **[Vellum Sentinel](/docs/sentinel)**, the spam content detection engine built into Vellum. It analyzes the email's subject and text body for patterns associated with spam: artificial urgency, prize and gain promises, fraud vocabulary, and invasive marketing language.

When a risk is detected, it shows the estimated probability and the words that contributed most to the classification. See the [Vellum Sentinel documentation](/docs/sentinel) to understand in detail what it detects and how to interpret the results.

### Subject not in all caps {#subject_not_allcaps}

**Severity:** warning — **Impact:** 6 points

Writing the subject in all caps is one of the most basic patterns that anti-spam filters detect. Emphasis in subject lines is achieved with well-chosen words, not capital letters.

### No excessive exclamation marks {#no_excessive_exclamation}

**Severity:** info — **Impact:** 3 points

A single exclamation mark in the subject may be acceptable in certain contexts. More than one triggers anti-spam filters in major providers.

### Subject without deceptive Re:/Fwd: {#no_deceptive_subject}

**Severity:** blocker — **Impact:** 10 points

Starting the subject with `Re:` or `Fwd:` when the email is not an actual reply (no `In-Reply-To` header) is a deceptive practice. Google and Microsoft actively identify it and treat it as an attempt to manipulate the recipient.

### No emoji in sender name {#no_emoji_from_name}

**Severity:** blocker — **Impact:** 8 points

Google identifies emojis in the sender's display name as an attempt to imitate visual verifications or trust badges. This practice directly triggers anti-spam filters.

### No hidden HTML content {#no_hidden_content}

**Severity:** blocker — **Impact:** 15 points

Hiding text in the HTML using `display:none`, `visibility:hidden`, `font-size:0`, `opacity:0`, or off-screen positioning is a technique used to deceive anti-spam filters. Google severely penalizes this practice.

### No attachments with dangerous extensions {#no_suspicious_attachments}

**Severity:** warning — **Impact:** 10 points

Mail providers automatically block attachments with executable extensions: `.exe`, `.bat`, `.cmd`, `.vbs`, `.js`, `.scr`, `.pif`, `.msi`, `.ps1`. An email with these attachments is rejected before reaching the recipient.

### Reasonable link count {#reasonable_link_count}

**Severity:** info — **Impact:** 3 points

More than 25 links in an email is a spam signal for automated filters. Legitimate emails have a limited number of relevant URLs.

### No URL shorteners {#no_url_shorteners}

**Severity:** warning — **Impact:** 6 points

Services like `bit.ly`, `goo.gl`, or `tinyurl.com` hide the real destination of a link. Anti-spam filters penalize them because they are used to bypass domain reputation. Links should point directly to the organization's domain.

### All images with alt attribute {#images_have_alt}

**Severity:** info — **Impact:** 4 points

Images without an `alt` attribute are penalized by anti-spam filters and are inaccessible to users with screen readers. When an image fails to load, the `alt` attribute is the only thing the recipient sees in its place.

### HTML size under 100 KB {#html_size_ok}

**Severity:** warning — **Impact:** 5 points

Gmail clips messages whose HTML exceeds 100 KB and shows a "View entire message" link. The recipient does not see the full email unless they click that link.

### Message size under 10 MB {#no_size_excess}

**Severity:** warning — **Impact:** 5 points

Messages exceeding 10 MB are rejected or blocked by most destination servers. If large files need to be shared, the standard practice is to use an external storage service and include the link in the email.

## Unsubscribe {#unsubscribe}

This category only applies to bulk emails (newsletters, marketing campaigns). Transactional emails — password confirmations, account notifications, system alerts — are automatically skipped. Vellum detects whether an email is transactional by analyzing its headers and subject keywords.

Since February 2024, Google, Microsoft, and Apple require unsubscribe mechanisms for senders who send more than 5,000 messages per day.

### List-Unsubscribe header present {#has_list_unsubscribe}

**Severity:** info — **Impact:** 2 points

The `List-Unsubscribe` header allows email clients to display an unsubscribe button directly in their interface, without the user having to open the email. Gmail and Yahoo display it prominently next to the sender.

### One-click unsubscribe (RFC 8058) {#has_one_click_unsubscribe}

**Severity:** info — **Impact:** 2 points

The `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header indicates that the server accepts unsubscribe requests via a direct POST request. Since February 2024, Gmail and Yahoo require this implementation for bulk senders.

### Unsubscribe link in body {#has_unsubscribe_body}

**Severity:** info — **Impact:** 2 points

In addition to the header, the email body must include a visible unsubscribe text or link. Google, Microsoft, and Apple require it to be easily locatable by the recipient.

## Accessibility and display {#a11y}

This category evaluates the visual experience of the email in different contexts: dark mode and color contrast.

### Dark mode support {#dark_mode_support}

**Severity:** info — **Impact:** 3 points

When an email client is in dark mode and the HTML does not declare explicit support for it, the client applies an automatic color inversion. The result can be black text on a black background or images with inverted colors.

There are two ways to declare dark mode support in an HTML email:

```html
<meta name="color-scheme" content="light dark">
```

```css
@media (prefers-color-scheme: dark) {
  /* dark mode styles */
}
```

The most robust approach is to combine both. The meta tag tells the client that the email actively handles color schemes.

### Adequate text contrast {#text_contrast}

**Severity:** info — **Impact:** 6 points

The analysis checks text-background color pairs defined in inline styles and calculates whether they meet the minimum contrast ratio of 4.5:1 established by WCAG guidelines. A ratio below 4.5:1 produces text that is hard to read, especially on low-quality screens or for people with reduced vision.

The analysis only evaluates colors defined in inline `style` attributes.
