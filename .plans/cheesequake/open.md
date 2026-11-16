# Open items (ruled "leave open")

- A late outcome price is stored under its horizon as done.
- The first-ever trade of a wallet with no history is lost: the first cycle only sets the cursor.
- The buy-to-sell ratio is the raw buy count when sells are 0 (the spec says so).
- Three guard rules have no pinning test: fee-payer adjustment, empty string in the number parser, zero-denominator guard.
