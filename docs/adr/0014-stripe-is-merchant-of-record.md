# ADR-0014: Stripe is the merchant of record (Managed Payments)

## Status

Accepted (2026-09-08) — amends the tax decision deferred in [ADR-0013](0013-stripe-subscriptions.md). The rest of ADR-0013 stands.

## Context

ADR-0013 shipped the subscription integration and deliberately left one thing open:

> **Stripe Tax is not enabled.** Charging US or EU customers carries sales-tax/VAT obligations, and `automatic_tax` collects nothing until a Stripe Tax registration exists — silently, with no error. This must be decided before charging real customers; it is a jurisdiction decision, not a code one.

This is that decision. The price is now set at **$39.99/month per account** (unlimited named crews), so the fee arithmetic below is concrete rather than hypothetical.

The two options were not "enable tax or not." They were *who is the legal seller*:

- **Stripe Tax** — software. It calculates and collects the right tax at checkout, but Retrograde remains the seller of record. Registration, filing, and audit liability stay with the business, per jurisdiction, wherever nexus exists.
- **Managed Payments** — Stripe becomes the merchant of record. It is the legal seller, and it remits sales tax, VAT, and GST in 80+ countries. No registrations, filings, or audits.

Retrograde is run by one person and sells a web subscription anyone in the world can buy. The compliance surface of staying seller of record is wide, and the work is recurring rather than one-time.

## Decision

**Enable Managed Payments.** `app/routes/app/billing.checkout.ts` sets `managed_payments: { enabled: true }` on the subscription Checkout Session. Stripe is the merchant of record for every subscription sold through it.

The cost is **3.5% per transaction on top of standard processing**, calculated on the full amount including tax. On $39.99: roughly $1.40/subscriber/month, taking total fees from about $1.46 to about $2.86 and net from about $38.53 to about $37.13.

That is cheap relative to the alternative. A single EU VAT registration plus filings, or US state nexus tracking, costs more than $1.40 × subscribers well before this reaches a few hundred customers — and costs the one person running it time that is worth more than the fee.

### API version

Managed Payments requires API version `2025-03-31.basil` **or later**. The installed SDK (`stripe@22.6.1`) defaults to `2026-08-26.dahlia`, which satisfies this. **No `apiVersion` is passed to the client and no `stripe-version` header is set.**

A Stripe-supplied onboarding blueprint suggested pinning `2026-02-25.preview`. That was the original preview of this feature; it went generally available and landed in the stable line by `dahlia/2026-04-22`. Pinning it now would be a downgrade to a preview API in production, so it was not followed.

### Parameters Stripe controls

Because Stripe is the seller, it owns parts of the Checkout Session. These are forbidden on a Managed Payments subscription session: `adaptive_pricing`, `automatic_tax`, `tax_id_collection`, `subscription_data.default_tax_rates`, `payment_method_configuration`, `payment_method_options`, `payment_method_types`, `customer_update[name]`, `customer_update[address]`, `shipping_address_collection`, `shipping_options`, `subscription_data.application_fee_percent`, `subscription_data.on_behalf_of`, `subscription_data.transfer_data`, `subscription_data.invoice_settings`, `invoice_creation`.

Our session set none of them already. A test asserts each stays absent, because `automatic_tax` in particular looks like the obvious way to add tax and is exactly the wrong move now — Managed Payments handles it.

## Consequences

**Positive**
- The tax gap ADR-0013 flagged is closed, not deferred. No registrations, no filings, no audit exposure in 80+ countries.
- Fraud prevention, dispute management, and transaction-level customer support come with it.
- Nothing in the app needs to know about tax. No tax tables, no nexus tracking, no `automatic_tax` wiring.

**Negative / load-bearing**
- **3.5% of revenue, permanently.** At scale this is the largest single line item in the pricing model and the obvious thing to revisit if volume ever makes self-managed compliance cheaper.
- **Stripe communicates with customers directly.** Receipts, invoices, refund and credit-note notifications, and certain subscription emails (trial start, renewal reminders, anniversary notices) are sent by Stripe from Link, not from Retrograde. Support for payment and subscription questions goes through Link support.
- **Stripe can refund without approval.** If Stripe requests product-specific input and gets no response within 48 hours, it may issue a refund unilaterally.
- **Refunds do not fully reverse tax.** In some jurisdictions Stripe must still remit the original sales tax on a refunded transaction, so the account balance is reduced by that amount even though the customer is made whole.
- **No migration path for existing subscriptions.** Only new subscriptions bought through a Managed Payments Checkout Session are eligible. There are no live subscriptions today, so this costs nothing now — but it means the decision is effectively one-way for anyone who subscribes before it is revisited.
- **Disputes are handled, not free.** Stripe reviews and counters disputes and submits evidence without involving us, but a *dispute received fee* is charged per dispute regardless of outcome, dispute-prevention tools (Dispute Resolution and similar) are billed to the account if Stripe enables them, and countering a dispute ourselves incurs an evidence submission fee that Stripe otherwise covers. Stripe may also accept a dispute unilaterally if it judges the case unwinnable. Whether the disputed principal is also clawed back is not stated in the Managed Payments documentation — confirm against the Managed Payments terms of service before taking real money.
- **Tax coverage is 82 countries for cross-border sales, not everywhere.** Domestic sales are covered wherever Managed Payments is available (except Singapore B2B and Japan). Cross-border coverage includes the US, the whole EU, UK, Canada, Australia, and most of Asia-Pacific — that is, the jurisdictions that most aggressively pursue foreign digital sellers. It does **not** include Latin America apart from Mexico, most of Africa, or much of the Middle East. Selling into an uncovered country leaves us responsible for indirect tax compliance there. Separately, Stripe refuses purchases outright from eight restricted countries (Ascension Island, China, Cuba, Iran, Kosovo, North Korea, Russia, Syria), so those need no handling on our side. The covered list moves as Stripe expands; treat the [tax-compliance doc](https://docs.stripe.com/payments/managed-payments/tax-compliance) as the source of truth rather than freezing a copy here.
- **Eligibility is not self-serve.** Stripe reviews business type and geography, the Managed Payments terms of service must be accepted in the Dashboard, and every product needs an eligible digital-goods tax code. None of that is enforceable from code; a misconfigured product simply will not sell through Managed Payments.

## Alternatives Considered

1. **Stripe Tax, staying seller of record.** Saves 3.5%. Rejected: it moves the calculation into software but leaves registration, filing, and liability with a single-person business selling internationally. The saving is real but small next to the recurring work and risk it buys back.
2. **Defer again, ship without tax handling.** Rejected: ADR-0013 already deferred once, and the deferral has an expiry — the first real customer. Deciding now costs nothing; deciding after taking money is a compliance problem rather than a design one.
3. **A third-party merchant of record (Paddle, Lemon Squeezy).** Not seriously pursued: comparable or higher fees, and it would mean replacing the Stripe integration that already works rather than adding one parameter to it.

## References

- ADR-0013 (the integration this amends), ADR-0011 (tiers and the entitlement seam).
- `app/routes/app/billing.checkout.ts` — the single `managed_payments` parameter.
- [Managed Payments](https://docs.stripe.com/payments/managed-payments), [how it works](https://docs.stripe.com/payments/managed-payments/how-it-works), [updating a Checkout integration](https://docs.stripe.com/payments/managed-payments/update-checkout), [eligibility](https://docs.stripe.com/payments/managed-payments/eligibility), [pricing](https://support.stripe.com/questions/managed-payments-pricing).
- GitHub issue #59.
