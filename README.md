# EMP Performance

> Monitor performance and guide career development for employee growth

[![Part of EmpCloud](https://img.shields.io/badge/EmpCloud-Module-blue)]()
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-green.svg)](LICENSE)
[![Status: Built](https://img.shields.io/badge/Status-Built-green)]()

EMP Performance is the performance management module of the EmpCloud ecosystem. It provides review cycles, goals and OKRs, self/manager/peer assessments, competency frameworks, career paths, 1-on-1 meetings, continuous feedback, PIPs, performance analytics with bell curve calibration, 9-box grid, succession planning, goal alignment trees, performance letter generation, skills gap analysis, and automated email reminders.

---

## Project Status

**Built** -- all phases implemented and tested.

| Metric | Count |
|--------|-------|
| Database tables | 25+ |
| Frontend pages | 30+ |
| Migrations | 4 |

---

## Features

| Feature | Status | Description |
|---------|--------|-------------|
| Review Cycles | Built | Create quarterly/annual/360-degree review cycles, add participants, launch |
| Goals & OKRs | Built | Set goals with key results, weight, due dates, progress tracking |
| Self-Assessment | Built | Employee self-review forms with competency ratings |
| Manager Assessment | Built | Manager reviews with ratings per competency |
| Peer Reviews | Built | 360-degree peer feedback with nomination workflow |
| Ratings & Bell Curve | Built | Org-wide ratings distribution, bell curve analysis, calibration |
| PIPs | Built | Performance Improvement Plans with objectives, timeline, progress updates |
| Competency Frameworks | Built | Define competencies per role/level |
| Career Paths | Built | Define career ladders and progression paths |
| 1-on-1 Meetings | Built | Schedule, agenda, notes, action items, recurrence |
| Continuous Feedback | Built | Quick kudos/feedback between review cycles |
| Performance Analytics | Built | Trends, team comparisons, top/bottom performers |
| 9-Box Grid | Built | Performance vs Potential matrix with color-coded cells, drag-to-reposition |
| Succession Planning | Built | Succession plans per role, candidate readiness tracking, development actions |
| Goal Alignment Tree | Built | Company -> department -> team -> individual goal cascade with progress rollup |
| Performance Letter Generation | Built | Appraisal, increment, promotion, confirmation, warning letter templates (Handlebars + PDF) |
| Skills Gap Analysis | Built | Radar chart visualization, gap table, learning recommendations per employee |
| Automated Email Reminders | Built | BullMQ daily jobs for review deadlines, PIP check-ins, meeting reminders, goal due dates |
| API Documentation | Built | Swagger UI at /api/docs with OpenAPI 3.0 spec |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20 |
| Backend | Express 5, TypeScript |
| Frontend | React 19, Vite 6, TypeScript |
| Styling | Tailwind CSS, Radix UI |
| Database | MySQL 8 via Knex.js (`emp_performance` database) |
| Cache / Queue | Redis 7, BullMQ |
| Auth | OAuth2/OIDC via EMP Cloud (RS256 JWT verification) |
| Charts | Recharts |
| PDF Generation | Puppeteer / Handlebars |

---

## Project Structure

```
emp-performance/
  package.json
  pnpm-workspace.yaml
  tsconfig.json
  docker-compose.yml
  .env.example
  packages/
    shared/                     # @emp-performance/shared
      src/
        types/                  # TypeScript interfaces & enums
        validators/             # Zod request validation schemas
        constants/              # Rating scales, statuses, defaults
    server/                     # @emp-performance/server (port 4300)
      src/
        config/                 # Environment configuration
        db/
          connection.ts         # Knex connection to emp_performance
          empcloud.ts           # Read-only connection to empcloud DB
          migrations/           # 4 migration files
        api/
          middleware/            # auth, RBAC, error handling
          routes/               # Route handlers per domain
        services/               # Business logic per domain
        jobs/                   # BullMQ workers (review reminders, PIP alerts, meeting reminders, goal deadlines)
        utils/                  # Logger, errors, response helpers
        swagger/                # OpenAPI spec & Swagger UI setup
    client/                     # @emp-performance/client (port 5177)
      src/
        api/                    # API client & hooks
        components/
          layout/               # DashboardLayout, SelfServiceLayout
          ui/                   # Radix-based UI primitives
          performance/          # NineBoxGrid, GoalAlignmentTree, SkillsRadar, etc.
        pages/                  # Route-based page components
        lib/                    # Auth store, utilities
```

---

## Database Tables (25+)

| Table | Purpose |
|-------|---------|
| `competency_frameworks` | Competency sets per org, role, and level |
| `competencies` | Individual competencies within a framework (with weights) |
| `review_cycles` | Quarterly/annual/360 review cycle configuration |
| `review_cycle_participants` | Employees participating in a cycle with status |
| `reviews` | Individual review submissions (self, manager, peer) |
| `review_competency_ratings` | Per-competency ratings within a review |
| `goals` | Employee/team goals with cascading hierarchy |
| `key_results` | OKR key results under a goal |
| `goal_check_ins` | Progress updates on goals/KRs |
| `goal_alignments` | Parent-child goal alignment links (company -> dept -> team -> individual) |
| `performance_improvement_plans` | PIP records with status lifecycle |
| `pip_objectives` | Specific objectives within a PIP |
| `pip_updates` | Progress check-ins for a PIP |
| `continuous_feedback` | Quick kudos/constructive feedback |
| `career_paths` | Career ladder definitions |
| `career_path_levels` | Steps/levels in a career path |
| `employee_career_tracks` | Employee assignment to career path/level |
| `one_on_one_meetings` | 1:1 meeting records with recurrence |
| `meeting_agenda_items` | Agenda, action items, and notes for 1:1s |
| `peer_review_nominations` | Peer nominations for 360 reviews |
| `rating_distributions` | Cached bell curve / distribution snapshots |
| `nine_box_placements` | Employee 9-box grid positions (performance vs potential) |
| `succession_plans` | Succession plans per critical role |
| `succession_candidates` | Candidates in succession plans with readiness level |
| `skills_assessments` | Employee skill ratings for gap analysis |
| `letter_templates` | Performance letter templates (appraisal, increment, promotion, etc.) |
| `generated_letters` | Generated performance letter PDFs |
| `email_reminder_configs` | Configurable reminder schedules per org |
| `audit_logs` | Module-specific audit trail |

**4 migrations** across the database schema.

---

## API Endpoints

All endpoints under `/api/v1/`. Server runs on port **4300**.

### Review Cycles
| Method | Path | Description |
|--------|------|-------------|
| GET | `/review-cycles` | List cycles (paginated, filterable) |
| POST | `/review-cycles` | Create new cycle |
| GET | `/review-cycles/:id` | Get cycle detail with participant stats |
| PUT | `/review-cycles/:id` | Update cycle settings/dates |
| POST | `/review-cycles/:id/launch` | Launch cycle, notify participants |
| POST | `/review-cycles/:id/close` | Close cycle, finalize ratings |
| POST | `/review-cycles/:id/participants` | Add participants (bulk) |
| GET | `/review-cycles/:id/ratings-distribution` | Bell curve data |

### Reviews
| Method | Path | Description |
|--------|------|-------------|
| GET | `/reviews` | List reviews for current user |
| GET | `/reviews/:id` | Get review detail with competency ratings |
| PUT | `/reviews/:id` | Save draft or submit review |
| POST | `/reviews/:id/submit` | Submit finalized review |

### Goals & OKRs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/goals` | List goals (filter by employee, cycle, status) |
| POST | `/goals` | Create goal |
| GET | `/goals/:id` | Get goal with key results and check-ins |
| POST | `/goals/:id/key-results` | Add key result |
| POST | `/goals/:id/check-in` | Log progress check-in |

### Goal Alignment Tree
| Method | Path | Description |
|--------|------|-------------|
| GET | `/goal-alignment/tree` | Get full alignment tree (company -> dept -> team -> individual) |
| POST | `/goal-alignment/link` | Link child goal to parent goal |
| DELETE | `/goal-alignment/link/:id` | Remove alignment link |
| GET | `/goal-alignment/rollup/:goalId` | Get progress rollup for a goal and its children |

### 9-Box Grid
| Method | Path | Description |
|--------|------|-------------|
| GET | `/nine-box` | Get 9-box grid data for org/department |
| PUT | `/nine-box/:employeeId` | Update employee placement (performance vs potential) |
| GET | `/nine-box/history/:employeeId` | Get placement history over time |

### Succession Planning
| Method | Path | Description |
|--------|------|-------------|
| GET | `/succession-plans` | List succession plans |
| POST | `/succession-plans` | Create succession plan for a role |
| GET | `/succession-plans/:id` | Get plan with candidates and readiness |
| POST | `/succession-plans/:id/candidates` | Add candidate to plan |
| PUT | `/succession-plans/:id/candidates/:candidateId` | Update readiness level |
| DELETE | `/succession-plans/:id/candidates/:candidateId` | Remove candidate |

### Skills Gap Analysis
| Method | Path | Description |
|--------|------|-------------|
| GET | `/skills-gap/:employeeId` | Get skills gap analysis for an employee |
| GET | `/skills-gap/team/:teamId` | Get team-level skills gap summary |
| POST | `/skills-gap/assess` | Submit skill assessment |
| GET | `/skills-gap/recommendations/:employeeId` | Get learning recommendations |

### Performance Letters
| Method | Path | Description |
|--------|------|-------------|
| GET | `/letter-templates` | List letter templates (appraisal, increment, promotion, confirmation, warning) |
| POST | `/letter-templates` | Create letter template |
| PUT | `/letter-templates/:id` | Update template |
| POST | `/letters/generate` | Generate performance letter PDF |
| GET | `/letters/:id/download` | Download generated letter |
| POST | `/letters/:id/send` | Email letter to employee |

### Competency Frameworks
| Method | Path | Description |
|--------|------|-------------|
| GET | `/competency-frameworks` | List frameworks |
| POST | `/competency-frameworks` | Create framework |
| GET | `/competency-frameworks/:id` | Get with competencies |
| POST | `/competency-frameworks/:id/competencies` | Add competency |

### PIPs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/pips` | List PIPs (filterable) |
| POST | `/pips` | Create PIP |
| GET | `/pips/:id` | Get PIP detail |
| POST | `/pips/:id/objectives` | Add objective |
| POST | `/pips/:id/updates` | Add check-in/update |
| POST | `/pips/:id/close` | Close PIP with outcome |

### Career Paths
| Method | Path | Description |
|--------|------|-------------|
| GET | `/career-paths` | List career paths |
| POST | `/career-paths` | Create career path |
| POST | `/career-paths/:id/levels` | Add level |
| GET | `/employees/:id/career-track` | Get employee career track |
| PUT | `/employees/:id/career-track` | Assign/update career track |

### 1-on-1 Meetings
| Method | Path | Description |
|--------|------|-------------|
| GET | `/one-on-ones` | List meetings |
| POST | `/one-on-ones` | Create meeting |
| POST | `/one-on-ones/:id/agenda-items` | Add agenda/action item |
| POST | `/one-on-ones/:id/complete` | Mark meeting completed |

### Other Endpoints
- **Continuous Feedback**: Give/receive feedback, public kudos wall
- **Peer Reviews**: Nominate peers, approve nominations
- **Self-Service**: My reviews, goals, PIPs, 1:1s, feedback, career track
- **Analytics**: Overview, ratings distribution, team comparison, trends, goal completion, top performers
- **Email Reminders**: Configure reminder schedules, view pending reminders
- **API Docs**: Swagger UI at `/api/docs`

---

## Frontend Pages (30+)

### Admin Pages
| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | Dashboard | Active cycles, pending reviews, goal completion rate |
| `/review-cycles` | Review Cycles | Table with status badges, create button |
| `/review-cycles/:id` | Review Cycle Detail | Tabs: Overview, Participants, Ratings, Settings |
| `/review-cycles/new` | Create Cycle | Multi-step wizard |
| `/goals` | Goals Overview | Tree view of org goals, filter by team/employee |
| `/goal-alignment` | Goal Alignment Tree | Company -> dept -> team -> individual cascade with progress rollup |
| `/nine-box` | 9-Box Grid | Performance vs Potential matrix with color-coded cells, click to drill down |
| `/succession-plans` | Succession Plans | List of plans with readiness indicators |
| `/succession-plans/:id` | Succession Plan Detail | Candidates, readiness tracking, development actions |
| `/skills-gap` | Skills Gap Analysis | Radar chart, gap table, learning recommendations |
| `/competency-frameworks` | Competency Frameworks | CRUD list and editor |
| `/pips` | PIP List | Filterable table |
| `/pips/:id` | PIP Detail | Timeline, objectives, updates |
| `/career-paths` | Career Paths | Visual ladder editor |
| `/analytics` | Analytics | Bell curve, trends, team comparison |
| `/feedback` | Feedback Wall | Public kudos feed |
| `/one-on-ones` | 1:1 Overview | Manager view of all 1:1s |
| `/letters` | Performance Letters | Generate and manage appraisal/increment/promotion/confirmation/warning letters |
| `/letter-templates` | Letter Templates | CRUD with Handlebars preview |
| `/settings` | Settings | Rating scales, defaults, notifications, reminder configuration |

### Self-Service Pages
| Route | Page | Description |
|-------|------|-------------|
| `/my` | My Performance | Cards: pending reviews, goals, upcoming 1:1 |
| `/my/reviews` | My Reviews | List of reviews to complete |
| `/my/reviews/:id` | My Review Form | Self-assessment with competency ratings |
| `/my/goals` | My Goals | Personal goals/OKRs with progress bars |
| `/my/goals/:id` | Goal Detail | Key results, check-in history |
| `/my/pip` | My PIP | Current PIP, objectives, updates |
| `/my/one-on-ones` | My 1:1s | Upcoming/past meetings |
| `/my/feedback` | My Feedback | Received and given feedback |
| `/my/career` | My Career Path | Current level, next steps, competency gaps |
| `/my/skills` | My Skills Gap | Personal radar chart, gap analysis, recommended learning |
| `/my/letters` | My Letters | View and download performance letters |

---

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 9+
- MySQL 8+
- Redis 7+
- EMP Cloud running (for authentication)

### Install
```bash
git clone https://github.com/anthropic/emp-performance.git
cd emp-performance
pnpm install
```

### Environment Setup
```bash
cp .env.example .env
# Edit .env with your database credentials and EMP Cloud URL
```

### Docker
```bash
docker-compose up -d
```

### Development
```bash
# Run all packages in development mode
pnpm dev

# Run individually
pnpm --filter @emp-performance/server dev    # Server on :4300
pnpm --filter @emp-performance/client dev    # Client on :5177

# Run migrations
pnpm --filter @emp-performance/server migrate
```

Once running, visit:
- **Client**: http://localhost:5177
- **API**: http://localhost:4300
- **API Documentation**: http://localhost:4300/api/docs

---

## License

This project is licensed under the [GPL-3.0 License](LICENSE).
