# EMP Performance

> Monitor performance and guide career development for employee growth

[![Part of EmpCloud](https://img.shields.io/badge/EmpCloud-Module-blue)]()
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-green.svg)](LICENSE)

EMP Performance is the performance management module of the EmpCloud ecosystem. It provides review cycles, goals and OKRs, self/manager/peer assessments, competency frameworks, career paths, 1-on-1 meetings, continuous feedback, PIPs, and performance analytics with bell curve calibration.

---

## Features

| Feature | Description |
|---------|-------------|
| Review Cycles | Create quarterly/annual/360-degree review cycles, add participants, launch |
| Goals & OKRs | Set goals with key results, weight, due dates, progress tracking |
| Self-Assessment | Employee self-review forms with competency ratings |
| Manager Assessment | Manager reviews with ratings per competency |
| Peer Reviews | 360-degree peer feedback with nomination workflow |
| Ratings & Bell Curve | Org-wide ratings distribution, bell curve analysis, calibration |
| PIPs | Performance Improvement Plans with objectives, timeline, progress updates |
| Competency Frameworks | Define competencies per role/level |
| Career Paths | Define career ladders and progression paths |
| 1-on-1 Meetings | Schedule, agenda, notes, action items, recurrence |
| Continuous Feedback | Quick kudos/feedback between review cycles |
| Performance Analytics | Trends, team comparisons, top/bottom performers |

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
          migrations/           # 5 migration files
        api/
          middleware/            # auth, RBAC, error handling
          routes/               # Route handlers per domain
        services/               # Business logic per domain
        jobs/                   # BullMQ workers (review reminders, PIP alerts)
        utils/                  # Logger, errors, response helpers
    client/                     # @emp-performance/client (port 5177)
      src/
        api/                    # API client & hooks
        components/
          layout/               # DashboardLayout, SelfServiceLayout
          ui/                   # Radix-based UI primitives
        pages/                  # Route-based page components
        lib/                    # Auth store, utilities
```

---

## Database Tables

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
| `audit_logs` | Module-specific audit trail |

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

---

## Frontend Pages

### Admin Pages
| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | Dashboard | Active cycles, pending reviews, goal completion rate |
| `/review-cycles` | Review Cycles | Table with status badges, create button |
| `/review-cycles/:id` | Review Cycle Detail | Tabs: Overview, Participants, Ratings, Settings |
| `/review-cycles/new` | Create Cycle | Multi-step wizard |
| `/goals` | Goals Overview | Tree view of org goals, filter by team/employee |
| `/competency-frameworks` | Competency Frameworks | CRUD list and editor |
| `/pips` | PIP List | Filterable table |
| `/pips/:id` | PIP Detail | Timeline, objectives, updates |
| `/career-paths` | Career Paths | Visual ladder editor |
| `/analytics` | Analytics | Bell curve, trends, team comparison |
| `/feedback` | Feedback Wall | Public kudos feed |
| `/one-on-ones` | 1:1 Overview | Manager view of all 1:1s |
| `/settings` | Settings | Rating scales, defaults, notifications |

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

---

## Implementation Plan

### Phase 1: Foundation (Weeks 1-2)
Scaffolding and core infrastructure.
- Initialize monorepo, copy/adapt boilerplate from emp-payroll
- Server: config, logger, dual DB connections, auth/error middleware
- Client: Vite/React shell, routing, layouts, auth
- Migration 001 (competency frameworks, review cycles, reviews, ratings)
- AuthService, EmployeeService, AuditService, health check

### Phase 2: Competency Frameworks + Review Cycles (Weeks 3-4)
- CompetencyFrameworkService + routes + validators
- ReviewCycleService (CRUD, launch, close)
- ReviewService (create/submit reviews, competency ratings)
- Admin UI: Competency Frameworks pages, Review Cycle list/create/detail

### Phase 3: Goals & OKRs (Weeks 5-6)
- GoalService (CRUD goals, key results, check-ins, progress aggregation)
- Goals routes + validators
- Admin UI: Goals overview with tree view
- Self-Service: My Goals page, create/edit, check-in flow

### Phase 4: Self/Manager/Peer Reviews (Weeks 7-8)
- Self-review and manager review form pages
- Peer review nominations and workflow
- Review submission with deadline enforcement
- Email notifications via BullMQ
- Migration 005 (peer nominations, rating distributions)

### Phase 5: PIPs + Continuous Feedback (Weeks 9-10)
- Migration 003 (PIPs, feedback tables)
- PIP service (full lifecycle), Feedback service
- Admin UI: PIP management, Self-Service: My PIP, feedback give/receive
- Public kudos wall

### Phase 6: Career Paths + 1-on-1s (Weeks 11-12)
- Migration 004 (career paths, meetings tables)
- CareerPathService, OneOnOneService
- Admin UI: Career path editor, 1:1 overview
- Self-Service: My Career page, My 1:1s

### Phase 7: Analytics + Bell Curve (Weeks 13-14)
- AnalyticsService (bell curve, trends, team comparisons)
- Rating calibration tools
- Analytics dashboard with Recharts, Redis caching
- CSV/PDF export

### Phase 8: Polish + Testing (Weeks 15-16)
- E2E tests (Playwright), unit tests (Vitest)
- BullMQ jobs for review reminders, PIP alerts, 1:1 reminders
- Docker Compose, performance optimization
- API documentation

---

## License

This project is licensed under the [GPL-3.0 License](LICENSE).
