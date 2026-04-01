# HTML analyzer {#top}

The analyzer is a standalone tool that lets you analyze an email's HTML without sending it through the SMTP server. It is useful for evaluating templates during development before integrating them with a real application.

The analysis uses exactly the same engine Vellum applies to emails received via SMTP. The checks, scoring, and grading are identical.

## How to use it {#usage}

Access the tool from **Tools → Analyzer** in the sidebar.

1. Drag an `.html` file onto the upload area, or click **Browse file** to locate it on your machine.
2. Click **Analyze**.
3. The result appears below with the score, grade, and details for each check.

To analyze another template, click the **X** next to the file name and repeat the process.

### File requirements

- The file must have an `.html` extension.
- Maximum file size is **5 MB**.

## Temporary analysis {#temporary}

The analysis is not saved anywhere. Reloading the page or navigating to another section discards the results. This is by design: the analyzer is a quick inspection tool, not a template history.

If you need to keep the result, copy or export the information before leaving the page.

## Expected score for plain HTML {#score-expectations}

When an HTML file is analyzed in isolation, the engine does not have the headers and metadata that normally accompany a real email. This causes several checks to fail or be skipped by design, regardless of the HTML quality.

The affected checks are:

| Check | Reason | Severity | Impact |
|---|---|---|---|
| Contains plain text version | The file only has HTML | warning | -8 pts |
| Subject is not empty | No subject in an HTML file | warning | -6 pts |
| Date header present | No headers in the file | warning | -5 pts |
| Contains Message-ID | No headers in the file | blocker | -10 pts |
| Sender includes display name | No From field in the file | warning | -5 pts |

This means a **technically perfect HTML will not exceed 66 points** in the file analyzer, and it will not earn the **Vellum Verified** distinction due to the missing Message-ID.

This limitation is expected and correct: a real email must always include those headers. The file analyzer lets you evaluate the HTML content of your template, while the full SMTP analysis also evaluates the message structure.

## Difference from SMTP analysis {#vs-smtp}

| | File analyzer | SMTP analysis |
|---|---|---|
| HTML source | Manually uploaded `.html` file | Email received by the server |
| Message headers | Not available | Available (From, Date, Message-ID…) |
| Plain text | Not available | Available if the email includes it |
| Attachments | Not evaluated | Evaluated |
| Saved to database | No | Yes |
| Persistent result | No — lost on page reload | Yes — available at any time |

The recommended workflow for a development team is to use the file analyzer for quick HTML template iterations, then send the final email through Vellum's SMTP to get the full analysis with all headers.

