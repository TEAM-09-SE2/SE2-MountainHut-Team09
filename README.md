# Mountain Hut — Team 09

A web application that helps hikers and hut staff coordinate the hospitality services of a mountain hut: table bookings, meal slots, menus, dietary requirements and occupancy.

Developed by Team 09 as the semester project for the **Software Engineering II** course at Politecnico di Torino.

## About the project

Mountain huts offer food, shelter and a place to sleep to people travelling in the mountains. Space, supplies and staff time are limited, and visitors' plans change with the weather. Requests arrive through the web, by phone or in person, which makes it easy for staff to lose track of changes or overbook the hut.

This application gives hikers and the hut team a shared, up-to-date view of what is booked and what is still available. Hikers can plan their stop with confidence. Staff can make good use of limited resources and keep track of the guests they are expecting.

### Who uses it

| Role         | Description                                                                  |
| ------------ | ---------------------------------------------------------------------------- |
| **User**     | Anyone visiting the public web pages.                                        |
| **Hiker**    | A registered user who books services for themselves or on behalf of a party. |
| **Employee** | A member of the hut team handling day-to-day operations.                     |
| **Warden**   | The hut manager. Oversees services and can do everything an employee can.    |

### Main features

- Book, change and cancel a table for a meal slot, with confirmation and updates
- Check availability and join a waiting list when a slot is fullgi
- Provide party requirements such as dietary restrictions and allergies
- Define slot capacity, weekly schedules and menus
- Monitor occupancy, and close or modify slots while handling the bookings they affect
- Reserve on behalf of hikers who contact the hut by phone or in person

See [context.md](context.md) for the full domain description and terminology.

## Database setup

The application uses PostgreSQL 16, started with Docker Compose. Run all commands below in **Git Bash**, from the repository root unless stated otherwise.

1. Create the database environment file:

   ```bash
   cp App/docker/.env.example App/docker/.env
   ```

2. Edit `App/docker/.env` and set `DB_USER` and `DB_PASSWORD` to your preferred credentials. You can also change `DB_NAME` and `DB_PORT` if needed.
3. Change to the Docker configuration directory and start the database:

   ```bash
   cd App/docker
   docker compose up -d db
   ```

   On the first startup, PostgreSQL creates the database and the tables automatically.

4. Check that the database is running and that its tables have been created. The command reads the database user and name from the container configuration:

   ```bash
   docker compose ps
   docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"'
   ```

Stop the database without deleting its data:

```bash
docker compose down
```

## User stories

Stories are sorted by decreasing business value.

| Story                     | Title                      | Business value |
| ------------------------- | -------------------------- | -------------: |
| [MH-01](stories/MH-01.md) | Book a table               |           1000 |
| [MH-02](stories/MH-02.md) | Define slot capacity       |            995 |
| [MH-03](stories/MH-03.md) | Receive confirmation       |            980 |
| [MH-04](stories/MH-04.md) | Check availability         |            975 |
| [MH-05](stories/MH-05.md) | Provide party requirements |            970 |
| [MH-06](stories/MH-06.md) | Change a booking           |            960 |
| [MH-07](stories/MH-07.md) | Reserve for an hiker       |            955 |
| [MH-08](stories/MH-08.md) | Cancel a booking           |            950 |
| [MH-09](stories/MH-09.md) | Repeat a weekly schedule   |            945 |
| [MH-10](stories/MH-10.md) | Define menus               |            940 |
| [MH-11](stories/MH-11.md) | View meal details          |            935 |
| [MH-12](stories/MH-12.md) | Monitor occupancy          |            930 |
| [MH-13](stories/MH-13.md) | Change a reservation       |            920 |
| [MH-14](stories/MH-14.md) | Receive Updates            |            915 |
| [MH-15](stories/MH-15.md) | Cancel a reservation       |            905 |
| [MH-16](stories/MH-16.md) | Join a waiting list        |            900 |
| [MH-17](stories/MH-17.md) | Close a slot               |            890 |
| [MH-18](stories/MH-18.md) | Handle affected bookings   |            880 |
| [MH-19](stories/MH-19.md) | Modify a slot              |            870 |

## Requirement clarifications

The requirements are shared by all teams and maintained by the teaching staff, who act as Product Owner. Questions about them go to the [shared requirements repository](https://github.com/SE2-Polito/AY26-27-Mountain-Hut/issues), not here:

- Search existing open and closed issues before asking.
- Open one issue per question using the _Requirement clarification_ template, include the story ID, and quote the unclear wording.
- Use the _Scrum process question_ template for questions to the Scrum Master.

Approved decisions are recorded in each story's Clarifications section. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full process.

## Course staff

- Marco Torchiano
- Antonio Vetrò
- Riccardo Coppola

## License

This project is licensed under the **GNU General Public License v3.0 or later (GPL-3.0-or-later)**. See the [LICENSE](LICENSE) file for the full text.

We chose GPL-3.0 because we want our software, and every modified version of it, to remain free software. Anyone may use, study, modify and redistribute it, even commercially, but anyone who distributes it or a derivative work must release the full source code under the same license. This ensures that improvements are shared back with the community and that our code cannot be turned into a closed, proprietary product.
