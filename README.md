# Stats Lab — Dice and Sports Data

Small programming exercises for dice simulation, sports-match ETL, tabular data, and SQLite storage.

**Status:** Learning and data-analysis exercises  
**Built with:** Python, JavaScript, CSV, SQLite

[Project guide](docs/PROJECT_GUIDE.md) · [Every file explained](docs/FILE_GUIDE.md) · [Licenses and dependencies](docs/LICENSE_REVIEW.md)

## Sports-data credentials

The ETL reads `BIGBALLS_API_KEY` from the environment. Copy [`.env.example`](.env.example) to `.env` and add a new key locally; `.env` and `.env.*` are ignored by Git. For a Node version supporting `--env-file`, start it with `node --env-file=.env etl.js`. Never commit a real key, including in the example file.

The ETL contacts an external service and writes local files and a SQLite database. Review the script before running; it drops and recreates a table. If a key was previously published, revoke or rotate it with the provider—Git history can retain old values.

## Start here

- [craps_simulation.py](craps_simulation.py) — Craps Baby! Ethan-da-Tech-Wizard 09/12/2026 I will be simulating the game of craps. The user will roll two dice and the program will determine if they win or lose based on the rule… Connects `random`.
- [etl.js](etl.js) — Source module for etl; defines `runETL`.
- [raw_matches.json](raw_matches.json) — Structured raw matches data; top-level fields: `data`, `meta`, `error`.

[Detailed setup, usage, and development notes](PROJECT_NOTES.md) preserve the previous project documentation.

## Repository layout

| Path | Role |
| --- | --- |
| [docs/](docs/) | Project documentation, decisions, and reference material (5 tracked entries). |

## Scope and current limits

Sports data retains its original provider rights.

## License

Original project code retains **MIT** terms in [LICENSE](LICENSE). Third-party libraries, media, data, models, and tools retain their own terms. See the [license review](docs/LICENSE_REVIEW.md) and [dependency inventory](docs/DEPENDENCIES.csv).
