# Vellum Sentinel {#top}

Vellum Sentinel is the spam content detection engine built into Vellum. It analyzes every email that enters the system and produces an assessment of its content, expressed as a probability percentage of being flagged as spam.

It requires no internet connection. It runs entirely within the Vellum process, without sending data to external services or adding any noticeable latency to the analysis flow.

## What it detects {#what-it-detects}

Vellum Sentinel recognizes content patterns that real email providers (Gmail, Outlook, Yahoo) use as negative signals. These include:

- **Artificial urgency** — language designed to pressure the recipient into acting immediately without reflection
- **Gain or prize promises** — promises of easy money, giveaways, prizes without real context
- **Aggressive offers** — extreme discounts, free products without justification
- **Invasive marketing patterns** — repetitive calls to action, hyperbolic language
- **Known fraud vocabulary** — terms commonly found in phishing and scam campaigns

Detection works in Spanish, English, and Portuguese simultaneously. An email can mix all three languages and Sentinel evaluates it coherently.

## How it appears in the analysis {#in-analysis}

Vellum Sentinel's result appears as the **"Content without spam indicators"** check within the **Deliverability** category of the analysis panel.

When the content exceeds the risk threshold, the check fails and shows a detail such as:

> Email content has an 88% probability of being flagged as spam. Detected words: [urgent, free, win, money, claim].

When the content is acceptable, the check passes and shows the estimated probability:

> Content shows no spam indicators (probability: 12%).

The probability is always calculated over the combination of the email's **subject and text body**. If the email has no text body, the check is skipped.

## How to interpret the results {#interpreting}

### The check passes but the probability is not zero

A low probability (below 25%) is expected in normal transactional emails: order confirmations, password resets, system notifications. No email has a 0% probability; the goal is to stay below the threshold.

### The check fails with detected words

The words listed in the detail are the terms that contributed most to the spam classification. Review whether they appear in the subject or body with an aggressive or sensationalist tone. Changing the context or wording can significantly reduce the probability.

### The probability is high but the content seems legitimate

This can happen in emails that combine several terms that are harmless individually but which Sentinel recognizes as a suspicious combination. In that case, check whether the email also has issues in other analysis categories — an email with proper RFC headers, plain text, and a clean sending domain carries much less real risk even if Sentinel detects something in the content.

## Known limitations {#limitations}

Vellum Sentinel is a statistical detector, not a perfect classifier. Keep the following in mind:

- **False positives**: legitimate marketing emails (well-formed newsletters) may get higher-than-expected probabilities if they use intense promotional vocabulary.
- **False negatives**: highly sophisticated spam or content in underrepresented languages may receive low probabilities.
- **Offline analysis**: Sentinel does not consult domain or IP reputation lists. An email may pass the content analysis and still be rejected in production due to the sending server's reputation.
- **Emails without plain text**: if the email only has an HTML body, Sentinel only analyzes the subject. The visible text inside the HTML is not processed. Always including a plain text version improves both the analysis and real deliverability.

