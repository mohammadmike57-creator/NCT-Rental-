# One repository: moving Render to this repository

Today the same system lives in two GitHub repositories:

| Repository | What Render does with it |
|------------|--------------------------|
| `NCT-Rental-` (this one) | Nothing: its Render service "NCT-Rental-" is **suspended** |
| `car-rental-backend-java` | Render service **NCT backend-java** builds it and serves www.nctrental.com |

Both hold the same files (the website at the top level, the server in `src/`, one `Dockerfile`). Every change is
copied from this repository to the other one. The goal: Render builds from **this** repository, and the other one
is kept read-only as an archive. Then there is one copy, one set of checks (GitHub runs them here), and nothing
can drift apart.

## What does not change

- The data: the database (car-rental-db) is not touched. It stays connected through the same environment variables.
- Logins, passwords, two-step sign-in, permissions.
- The address www.nctrental.com and its two custom domains stay on the same Render service.
- Brokers: same addresses and keys.
- The environment variables (`JWT_SECRET`, `JWT_SECRET_PREVIOUS`, database, `ALERT_EMAIL`, …) belong to the
  Render service, not to the repository, so they stay as they are.

## Before you start (5 minutes)

1. Render → **car-rental-db** → Recovery → **Create export**, and download it.
2. Check that both repositories hold the same code: the last commit of each says "(mirror of the website
   repo)" for the same change. (I check this before every push.)
3. Pick a quiet time. The switch itself causes one normal deploy, like any update (about 5–10 minutes, with
   the old version serving until the new one is ready).

## The switch

1. Render → **NCT backend-java** → **Settings** → **Build & Deploy** → **Repository** → **Edit**.
2. Choose `mohammadmike57-creator/NCT-Rental-`, branch **main**. Leave *Root Directory* empty and the
   *Dockerfile path* as `./Dockerfile` (the same file).
3. Save. Render starts a deploy from this repository.
4. When it says **Live**: open www.nctrental.com, sign in, open Reservations and one agreement. Open
   `/health` (it should say OK).

If Render does not offer **Edit** on the repository: create a new Web Service from `NCT-Rental-` (Docker, same
region and plan), copy every environment variable, wait until it is live, then move the two custom domains from
NCT backend-java to it and suspend NCT backend-java. Ask me before doing this; it takes longer.

## Way back

Settings → Repository → Edit → `car-rental-backend-java`, branch main. Same code, so nothing is lost.

## Afterwards (I do these, with your OK)

1. A note at the top of `car-rental-backend-java`'s README: "Archived: the system lives in NCT-Rental-".
   Then you can archive it on GitHub (Settings → Archive this repository), which makes it read-only.
2. Delete the suspended Render service **NCT-Rental-** (it costs nothing while suspended, but it is confusing).
3. Pushes go to this repository only; GitHub's checks (website, server, end-to-end) run on each one.
