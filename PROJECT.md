# EMP Performance — Project Progress

## Status: In Progress

### Scaffolding
- [ ] Root config (package.json, pnpm-workspace, tsconfig, docker-compose, .env)
- [ ] Shared package (types, validators, constants)
- [ ] Server infrastructure (config, utils, DB layer, auth middleware)
- [ ] Client shell (Vite, React, Tailwind, routing, layouts)

### Database (5 migrations, 21 tables)
- [ ] Migration 001: competency_frameworks, competencies, review_cycles, review_cycle_participants, reviews, review_competency_ratings
- [ ] Migration 002: goals, key_results, goal_check_ins
- [ ] Migration 003: performance_improvement_plans, pip_objectives, pip_updates, continuous_feedback
- [ ] Migration 004: career_paths, career_path_levels, employee_career_tracks, one_on_one_meetings, meeting_agenda_items
- [ ] Migration 005: peer_review_nominations, rating_distributions, audit_logs

### Server Services (13 services)
- [ ] Auth (login, SSO, refresh)
- [ ] Review Cycles (CRUD, launch, close, participants)
- [ ] Reviews (create, draft, submit, competency ratings)
- [ ] Competency Frameworks (CRUD + competencies)
- [ ] Goals & OKRs (CRUD, key results, check-ins)
- [ ] PIPs (CRUD, objectives, updates)
- [ ] Career Paths (CRUD, levels, employee tracks)
- [ ] 1-on-1 Meetings (CRUD, agenda items, recurrence)
- [ ] Continuous Feedback (give/receive, kudos wall)
- [ ] Analytics (bell curve, trends, team comparisons)
- [ ] Peer Reviews (nominations, approval)

### Frontend Pages (26 pages)
- [ ] Admin: Dashboard, Review Cycles, Goals, Competencies, PIPs, Career Paths, Analytics, Feedback Wall, 1-on-1s, Settings
- [ ] Self-Service: My Performance, My Reviews, My Goals, My PIP, My 1-on-1s, My Feedback, My Career
