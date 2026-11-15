# sch-1.11 End-to-end round check

- `e2e/integration/sch-1-11-full-path.test.ts`: the whole path through the API with the customer's and the staff
  panel's live streams open: handoff (limit) -> queue event -> claim -> staff reply live to the customer -> customer
  reply live to staff -> close -> customer back with the bot; full conversation kept. The bot's own handoff answer is
  covered by `e2e/py/sch_1_3_handoff_test.py` (a Node test cannot run the Python bot).
- UI path: checked by hand in the sch-1.7 and sch-1.8 walk-throughs (no new Playwright specs this round).
- `docs/staff-chat.md` (new): flow, statuses, where the code is, what is deferred.
