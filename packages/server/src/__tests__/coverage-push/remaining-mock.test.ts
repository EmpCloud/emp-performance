import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock DB adapter
// ---------------------------------------------------------------------------
const mockDB: any = {
  findOne: vi.fn(),
  findMany: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  count: vi.fn().mockResolvedValue(0),
  raw: vi.fn().mockResolvedValue([[]]),
};

vi.mock("../../db/adapters", () => ({
  getDB: () => mockDB,
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../config", () => ({
  config: {
    jwt: { secret: "test-secret", accessExpiry: "1h", refreshExpiry: "7d" },
    db: { host: "localhost", port: 3306, user: "root", password: "", name: "test", poolMin: 1, poolMax: 5 },
    empcloudDb: { host: "localhost", port: 3306, user: "root", password: "", name: "empcloud" },
  },
}));

vi.mock("../../db/empcloud", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  findOrgById: vi.fn(),
  createOrganization: vi.fn(),
  createUser: vi.fn(),
}));

// =========================================================================
// Auth Service
// =========================================================================
import { login, register, ssoLogin, refreshToken } from "../../services/auth/auth.service";
import { findUserByEmail, findUserById, findOrgById, createOrganization, createUser } from "../../db/empcloud";

const mockedFindUserByEmail = vi.mocked(findUserByEmail);
const mockedFindUserById = vi.mocked(findUserById);
const mockedFindOrgById = vi.mocked(findOrgById);
const mockedCreateOrganization = vi.mocked(createOrganization);
const mockedCreateUser = vi.mocked(createUser);

describe("auth.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("login", () => {
    it("should throw if user not found", async () => {
      mockedFindUserByEmail.mockResolvedValue(null);
      await expect(login("bad@test.com", "pass")).rejects.toThrow("Invalid email or password");
    });

    it("should throw if user has no password", async () => {
      mockedFindUserByEmail.mockResolvedValue({
        id: 1, organization_id: 1, first_name: "Test", last_name: "User",
        email: "test@test.com", password: null, role: "employee",
      } as any);
      await expect(login("test@test.com", "pass")).rejects.toThrow("Password not set");
    });

    it("should throw if password is wrong", async () => {
      // bcrypt hash for "correct_password" (using rounds=4 for speed)
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash("correct_password", 4);
      mockedFindUserByEmail.mockResolvedValue({
        id: 1, organization_id: 1, first_name: "Test", last_name: "User",
        email: "test@test.com", password: hash, role: "employee",
      } as any);
      await expect(login("test@test.com", "wrong_password")).rejects.toThrow("Invalid email or password");
    });

    it("should throw if organization is inactive", async () => {
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash("password", 4);
      mockedFindUserByEmail.mockResolvedValue({
        id: 1, organization_id: 1, first_name: "Test", last_name: "User",
        email: "test@test.com", password: hash, role: "employee",
      } as any);
      mockedFindOrgById.mockResolvedValue(null);
      await expect(login("test@test.com", "password")).rejects.toThrow("inactive");
    });

    it("should throw if org.is_active is false", async () => {
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash("password", 4);
      mockedFindUserByEmail.mockResolvedValue({
        id: 1, organization_id: 1, first_name: "Test", last_name: "User",
        email: "test@test.com", password: hash, role: "employee",
      } as any);
      mockedFindOrgById.mockResolvedValue({ id: 1, name: "Test Org", is_active: false } as any);
      await expect(login("test@test.com", "password")).rejects.toThrow("inactive");
    });

    it("should return tokens on valid login", async () => {
      const bcrypt = await import("bcryptjs");
      const hash = await bcrypt.hash("password", 4);
      mockedFindUserByEmail.mockResolvedValue({
        id: 1, organization_id: 1, first_name: "Test", last_name: "User",
        email: "test@test.com", password: hash, role: "hr_admin",
      } as any);
      mockedFindOrgById.mockResolvedValue({ id: 1, name: "Test Org", is_active: true } as any);

      const result = await login("test@test.com", "password");
      expect(result.user.email).toBe("test@test.com");
      expect(result.tokens.accessToken).toBeTruthy();
      expect(result.tokens.refreshToken).toBeTruthy();
    });
  });

  describe("register", () => {
    it("should throw if email already exists", async () => {
      mockedFindUserByEmail.mockResolvedValue({ id: 1, email: "existing@test.com" } as any);
      await expect(register({
        orgName: "Test", firstName: "A", lastName: "B", email: "existing@test.com", password: "pass",
      })).rejects.toThrow("already exists");
    });

    it("should register new user and org", async () => {
      mockedFindUserByEmail.mockResolvedValue(null);
      mockedCreateOrganization.mockResolvedValue({ id: 1, name: "New Org" } as any);
      mockedCreateUser.mockResolvedValue({
        id: 1, organization_id: 1, first_name: "A", last_name: "B",
        email: "new@test.com", role: "hr_admin",
      } as any);

      const result = await register({
        orgName: "New Org", firstName: "A", lastName: "B",
        email: "new@test.com", password: "secure123", country: "US",
      });
      expect(result.user.email).toBe("new@test.com");
      expect(result.tokens.accessToken).toBeTruthy();
    });

    it("should use default country IN", async () => {
      mockedFindUserByEmail.mockResolvedValue(null);
      mockedCreateOrganization.mockResolvedValue({ id: 1, name: "Org" } as any);
      mockedCreateUser.mockResolvedValue({
        id: 1, organization_id: 1, first_name: "A", last_name: "B",
        email: "a@b.com", role: "hr_admin",
      } as any);

      await register({ orgName: "Org", firstName: "A", lastName: "B", email: "a@b.com", password: "pass" });
      expect(mockedCreateOrganization).toHaveBeenCalledWith(expect.objectContaining({ country: "IN" }));
    });
  });

  describe("ssoLogin", () => {
    it("should throw for invalid SSO token (non-decodable)", async () => {
      await expect(ssoLogin("not-a-jwt")).rejects.toThrow("Invalid SSO token");
    });

    it("should throw if SSO token has no sub", async () => {
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign({ name: "test" }, "some-secret"); // no sub
      await expect(ssoLogin(token)).rejects.toThrow("missing user id");
    });

    it("should throw if user not found", async () => {
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign({ sub: 123 }, "some-secret");
      mockedFindUserById.mockResolvedValue(null);
      await expect(ssoLogin(token)).rejects.toThrow("not found or inactive");
    });

    it("should throw if user inactive (status != 1)", async () => {
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign({ sub: 123 }, "some-secret");
      mockedFindUserById.mockResolvedValue({ id: 123, status: 0, organization_id: 1 } as any);
      await expect(ssoLogin(token)).rejects.toThrow("not found or inactive");
    });

    it("should throw if org inactive", async () => {
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign({ sub: 123 }, "some-secret");
      mockedFindUserById.mockResolvedValue({
        id: 123, status: 1, organization_id: 1, first_name: "A", last_name: "B",
        email: "test@test.com", role: "employee",
      } as any);
      mockedFindOrgById.mockResolvedValue(null);
      await expect(ssoLogin(token)).rejects.toThrow("inactive");
    });

    it("should return tokens on valid SSO login (no jti)", async () => {
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign({ sub: 123 }, "some-secret");
      mockedFindUserById.mockResolvedValue({
        id: 123, status: 1, organization_id: 1, first_name: "Test", last_name: "User",
        email: "test@test.com", role: "employee",
      } as any);
      mockedFindOrgById.mockResolvedValue({ id: 1, name: "Test Org", is_active: true } as any);

      const result = await ssoLogin(token);
      expect(result.user.email).toBe("test@test.com");
      expect(result.tokens.accessToken).toBeTruthy();
    });

    it("should handle jti validation when empcloud DB throws", async () => {
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign({ sub: 123, jti: "some-jti" }, "some-secret");

      // The dynamic import of empcloud will use our mock which doesn't have getEmpCloudDB
      // This should fall through the catch block
      mockedFindUserById.mockResolvedValue({
        id: 123, status: 1, organization_id: 1, first_name: "Test", last_name: "User",
        email: "test@test.com", role: "employee",
      } as any);
      mockedFindOrgById.mockResolvedValue({ id: 1, name: "Test Org", is_active: true } as any);

      const result = await ssoLogin(token);
      expect(result.tokens.accessToken).toBeTruthy();
    });
  });

  describe("refreshToken", () => {
    it("should throw for invalid token", async () => {
      await expect(refreshToken("bad-token")).rejects.toThrow("Invalid or expired");
    });

    it("should throw for non-refresh token type", async () => {
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign({ userId: 1, type: "access" }, "test-secret");
      await expect(refreshToken(token)).rejects.toThrow("Invalid token type");
    });

    it("should throw if user not found", async () => {
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign({ userId: 1, type: "refresh" }, "test-secret");
      mockedFindUserById.mockResolvedValue(null);
      await expect(refreshToken(token)).rejects.toThrow("not found or inactive");
    });

    it("should throw if user inactive", async () => {
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign({ userId: 1, type: "refresh" }, "test-secret");
      mockedFindUserById.mockResolvedValue({ id: 1, status: 0 } as any);
      await expect(refreshToken(token)).rejects.toThrow("not found or inactive");
    });

    it("should throw if org inactive", async () => {
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign({ userId: 1, type: "refresh" }, "test-secret");
      mockedFindUserById.mockResolvedValue({
        id: 1, status: 1, organization_id: 1, first_name: "A", last_name: "B",
        email: "test@test.com", role: "employee",
      } as any);
      mockedFindOrgById.mockResolvedValue({ id: 1, is_active: false } as any);
      await expect(refreshToken(token)).rejects.toThrow("inactive");
    });

    it("should return new tokens on valid refresh", async () => {
      const jwt = await import("jsonwebtoken");
      const token = jwt.default.sign({ userId: 1, type: "refresh" }, "test-secret");
      mockedFindUserById.mockResolvedValue({
        id: 1, status: 1, organization_id: 1, first_name: "A", last_name: "B",
        email: "test@test.com", role: "hr_admin",
      } as any);
      mockedFindOrgById.mockResolvedValue({ id: 1, name: "Org", is_active: true } as any);

      const result = await refreshToken(token);
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });
  });
});

// =========================================================================
// Career Path Service
// =========================================================================
import {
  createPath,
  listPaths,
  getPath,
  updatePath,
  deletePath,
  addLevel,
  updateLevel,
  removeLevel,
  assignTrack,
  getEmployeeTrack,
} from "../../services/career/career-path.service";

const ORG = 1;

describe("career-path.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  describe("createPath", () => {
    it("should create with all fields", async () => {
      mockDB.create.mockResolvedValue({ id: "cp-1", name: "Engineering" });
      const result = await createPath(ORG, { name: "Engineering", description: "Eng path", department: "Eng", created_by: 10 });
      expect(result.name).toBe("Engineering");
    });

    it("should create with defaults", async () => {
      mockDB.create.mockResolvedValue({ id: "cp-1" });
      await createPath(ORG, { name: "Simple", created_by: 10 });
      expect(mockDB.create).toHaveBeenCalledWith("career_paths", expect.objectContaining({
        description: null,
        department: null,
      }));
    });
  });

  describe("listPaths", () => {
    it("should list with default params", async () => {
      await listPaths(ORG);
      expect(mockDB.findMany).toHaveBeenCalledWith("career_paths", expect.objectContaining({ page: 1, limit: 50 }));
    });

    it("should list with custom params", async () => {
      await listPaths(ORG, { page: 2, limit: 10 });
      expect(mockDB.findMany).toHaveBeenCalledWith("career_paths", expect.objectContaining({ page: 2, limit: 10 }));
    });
  });

  describe("getPath", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(getPath(ORG, "x")).rejects.toThrow("Career path");
    });

    it("should return path with levels", async () => {
      mockDB.findOne.mockResolvedValue({ id: "cp-1", name: "Eng" });
      mockDB.findMany.mockResolvedValue({ data: [{ id: "lvl-1", level: 1 }], total: 1, page: 1, limit: 100, totalPages: 1 });
      const result = await getPath(ORG, "cp-1");
      expect(result.levels).toHaveLength(1);
    });
  });

  describe("updatePath", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(updatePath(ORG, "x", { name: "New" })).rejects.toThrow("Career path");
    });

    it("should update path", async () => {
      mockDB.findOne.mockResolvedValue({ id: "cp-1" });
      mockDB.update.mockResolvedValue({ id: "cp-1", name: "Updated" });
      const result = await updatePath(ORG, "cp-1", { name: "Updated", description: "New desc", department: "Sales", is_active: false });
      expect(result.name).toBe("Updated");
    });
  });

  describe("deletePath", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(deletePath(ORG, "x")).rejects.toThrow("Career path");
    });

    it("should delete path", async () => {
      mockDB.findOne.mockResolvedValue({ id: "cp-1" });
      mockDB.delete.mockResolvedValue(true);
      await deletePath(ORG, "cp-1");
      expect(mockDB.delete).toHaveBeenCalledWith("career_paths", "cp-1");
    });
  });

  describe("addLevel", () => {
    it("should throw if path not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(addLevel(ORG, "x", { title: "Junior", level: 1 })).rejects.toThrow("Career path");
    });

    it("should add level with all fields", async () => {
      mockDB.findOne.mockResolvedValue({ id: "cp-1" });
      mockDB.create.mockResolvedValue({ id: "lvl-1" });
      await addLevel(ORG, "cp-1", { title: "Senior", level: 3, description: "Senior dev", requirements: "5+ years", min_years_experience: 5 });
      expect(mockDB.create).toHaveBeenCalledWith("career_path_levels", expect.objectContaining({ level: 3, min_years_experience: 5 }));
    });

    it("should add level with defaults", async () => {
      mockDB.findOne.mockResolvedValue({ id: "cp-1" });
      mockDB.create.mockResolvedValue({ id: "lvl-1" });
      await addLevel(ORG, "cp-1", { title: "Junior", level: 1 });
      expect(mockDB.create).toHaveBeenCalledWith("career_path_levels", expect.objectContaining({
        description: null, requirements: null, min_years_experience: null,
      }));
    });
  });

  describe("updateLevel", () => {
    it("should throw if level not found", async () => {
      mockDB.findById.mockResolvedValue(null);
      await expect(updateLevel(ORG, "x", { title: "New" })).rejects.toThrow("Career path level");
    });

    it("should throw if path not in org", async () => {
      mockDB.findById.mockResolvedValue({ id: "lvl-1", career_path_id: "cp-1" });
      mockDB.findOne.mockResolvedValue(null);
      await expect(updateLevel(ORG, "lvl-1", { title: "New" })).rejects.toThrow("Career path");
    });

    it("should update level", async () => {
      mockDB.findById.mockResolvedValue({ id: "lvl-1", career_path_id: "cp-1" });
      mockDB.findOne.mockResolvedValue({ id: "cp-1" });
      mockDB.update.mockResolvedValue({ id: "lvl-1", title: "Updated" });
      const result = await updateLevel(ORG, "lvl-1", { title: "Updated", level: 2, description: "New", requirements: "Req", min_years_experience: 3 });
      expect(result.title).toBe("Updated");
    });
  });

  describe("removeLevel", () => {
    it("should throw if level not found", async () => {
      mockDB.findById.mockResolvedValue(null);
      await expect(removeLevel(ORG, "x")).rejects.toThrow("Career path level");
    });

    it("should throw if path not in org", async () => {
      mockDB.findById.mockResolvedValue({ id: "lvl-1", career_path_id: "cp-1" });
      mockDB.findOne.mockResolvedValue(null);
      await expect(removeLevel(ORG, "lvl-1")).rejects.toThrow("Career path");
    });

    it("should remove level", async () => {
      mockDB.findById.mockResolvedValue({ id: "lvl-1", career_path_id: "cp-1" });
      mockDB.findOne.mockResolvedValue({ id: "cp-1" });
      mockDB.delete.mockResolvedValue(true);
      await removeLevel(ORG, "lvl-1");
      expect(mockDB.delete).toHaveBeenCalledWith("career_path_levels", "lvl-1");
    });
  });

  describe("assignTrack", () => {
    it("should throw if path not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(assignTrack(ORG, 10, "x", "lvl-1")).rejects.toThrow("Career path");
    });

    it("should update existing track", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "cp-1" }) // path
        .mockResolvedValueOnce({ id: "et-1", employee_id: 10, career_path_id: "cp-1" }); // existing
      mockDB.update.mockResolvedValue({ id: "et-1" });
      await assignTrack(ORG, 10, "cp-1", "lvl-2", "lvl-3");
      expect(mockDB.update).toHaveBeenCalledWith("employee_career_tracks", "et-1", expect.objectContaining({
        current_level_id: "lvl-2",
        target_level_id: "lvl-3",
      }));
    });

    it("should create new track", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "cp-1" })
        .mockResolvedValueOnce(null);
      mockDB.create.mockResolvedValue({ id: "et-1" });
      await assignTrack(ORG, 10, "cp-1", "lvl-1");
      expect(mockDB.create).toHaveBeenCalledWith("employee_career_tracks", expect.objectContaining({
        target_level_id: null,
      }));
    });
  });

  describe("getEmployeeTrack", () => {
    it("should return enriched tracks", async () => {
      mockDB.findMany.mockResolvedValue({ data: [
        { id: "et-1", career_path_id: "cp-1", current_level_id: "lvl-1", target_level_id: "lvl-2" },
      ], total: 1, page: 1, limit: 50, totalPages: 1 });
      mockDB.findOne.mockResolvedValue({ id: "cp-1", organization_id: ORG }); // path
      mockDB.findById
        .mockResolvedValueOnce({ id: "lvl-1", title: "Junior" }) // current
        .mockResolvedValueOnce({ id: "lvl-2", title: "Senior" }); // target

      const result = await getEmployeeTrack(ORG, 10);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBeTruthy();
      expect(result[0].currentLevel).toBeTruthy();
    });

    it("should filter out tracks not in org", async () => {
      mockDB.findMany.mockResolvedValue({ data: [
        { id: "et-1", career_path_id: "cp-1", current_level_id: "lvl-1", target_level_id: null },
      ], total: 1, page: 1, limit: 50, totalPages: 1 });
      mockDB.findOne.mockResolvedValue(null); // path not found in org
      mockDB.findById.mockResolvedValue({ id: "lvl-1" });

      const result = await getEmployeeTrack(ORG, 10);
      expect(result).toHaveLength(0);
    });
  });
});

// =========================================================================
// Competency Framework Service
// =========================================================================
import {
  createFramework,
  listFrameworks,
  getFramework,
  updateFramework,
  deleteFramework,
  addCompetency,
  updateCompetency,
  removeCompetency,
} from "../../services/competency/competency-framework.service";

describe("competency-framework.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  describe("createFramework", () => {
    it("should create framework with defaults", async () => {
      mockDB.create.mockResolvedValue({ id: "fw-1", name: "Test" });
      const result = await createFramework(ORG, { name: "Test" }, 10);
      expect(result.name).toBe("Test");
      expect(mockDB.create).toHaveBeenCalledWith("competency_frameworks", expect.objectContaining({
        is_active: true,
        description: null,
      }));
    });

    it("should create with all fields", async () => {
      mockDB.create.mockResolvedValue({ id: "fw-1" });
      await createFramework(ORG, { name: "Full", description: "Desc", is_active: false }, 10);
      expect(mockDB.create).toHaveBeenCalledWith("competency_frameworks", expect.objectContaining({
        description: "Desc",
        is_active: false,
      }));
    });
  });

  describe("listFrameworks", () => {
    it("should list frameworks", async () => {
      mockDB.findMany.mockResolvedValue({ data: [{ id: "fw-1" }], total: 1, page: 1, limit: 20, totalPages: 1 });
      const result = await listFrameworks(ORG);
      expect(result).toHaveLength(1);
    });
  });

  describe("getFramework", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(getFramework(ORG, "x")).rejects.toThrow("CompetencyFramework");
    });

    it("should return framework with competencies", async () => {
      mockDB.findOne.mockResolvedValue({ id: "fw-1", name: "Test" });
      mockDB.findMany.mockResolvedValue({ data: [{ id: "comp-1" }], total: 1, page: 1, limit: 20, totalPages: 1 });
      const result = await getFramework(ORG, "fw-1");
      expect(result.competencies).toHaveLength(1);
    });
  });

  describe("updateFramework", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(updateFramework(ORG, "x", { name: "New" })).rejects.toThrow("CompetencyFramework");
    });

    it("should update framework", async () => {
      mockDB.findOne.mockResolvedValue({ id: "fw-1" });
      mockDB.update.mockResolvedValue({ id: "fw-1", name: "Updated" });
      const result = await updateFramework(ORG, "fw-1", { name: "Updated", description: "New", is_active: true });
      expect(result.name).toBe("Updated");
    });
  });

  describe("deleteFramework", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(deleteFramework(ORG, "x")).rejects.toThrow("CompetencyFramework");
    });

    it("should soft delete via deleted_at", async () => {
      mockDB.findOne.mockResolvedValue({ id: "fw-1" });
      mockDB.update.mockResolvedValue({});
      await deleteFramework(ORG, "fw-1");
      expect(mockDB.update).toHaveBeenCalledWith("competency_frameworks", "fw-1", expect.objectContaining({ deleted_at: expect.any(String) }));
    });
  });

  describe("addCompetency", () => {
    it("should throw if framework not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(addCompetency(ORG, "x", { name: "Test" })).rejects.toThrow("CompetencyFramework");
    });

    it("should add competency with defaults", async () => {
      mockDB.findOne.mockResolvedValue({ id: "fw-1" });
      mockDB.create.mockResolvedValue({ id: "comp-1" });
      await addCompetency(ORG, "fw-1", { name: "Core" });
      expect(mockDB.create).toHaveBeenCalledWith("competencies", expect.objectContaining({
        category: null, weight: 1, order: 0, description: null,
      }));
    });

    it("should add competency with all fields", async () => {
      mockDB.findOne.mockResolvedValue({ id: "fw-1" });
      mockDB.create.mockResolvedValue({ id: "comp-1" });
      await addCompetency(ORG, "fw-1", { name: "Lead", description: "Desc", category: "leadership", weight: 3, order: 1 });
      expect(mockDB.create).toHaveBeenCalledWith("competencies", expect.objectContaining({ weight: 3, order: 1 }));
    });
  });

  describe("updateCompetency", () => {
    it("should throw if framework not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(updateCompetency(ORG, "x", "comp-1", { name: "New" })).rejects.toThrow("CompetencyFramework");
    });

    it("should throw if competency not found", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "fw-1" }).mockResolvedValueOnce(null);
      await expect(updateCompetency(ORG, "fw-1", "comp-x", { name: "New" })).rejects.toThrow("Competency");
    });

    it("should update competency", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "fw-1" }).mockResolvedValueOnce({ id: "comp-1" });
      mockDB.update.mockResolvedValue({ id: "comp-1", name: "Updated" });
      const result = await updateCompetency(ORG, "fw-1", "comp-1", { name: "Updated" });
      expect(result.name).toBe("Updated");
    });
  });

  describe("removeCompetency", () => {
    it("should throw if framework not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(removeCompetency(ORG, "x", "comp-1")).rejects.toThrow("CompetencyFramework");
    });

    it("should throw if competency not found", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "fw-1" }).mockResolvedValueOnce(null);
      await expect(removeCompetency(ORG, "fw-1", "comp-x")).rejects.toThrow("Competency");
    });

    it("should remove competency", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "fw-1" }).mockResolvedValueOnce({ id: "comp-1" });
      mockDB.delete.mockResolvedValue(true);
      await removeCompetency(ORG, "fw-1", "comp-1");
      expect(mockDB.delete).toHaveBeenCalledWith("competencies", "comp-1");
    });
  });
});

// =========================================================================
// Performance Letter Service
// =========================================================================
import {
  createTemplate,
  listTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  generateLetter,
  listLetters,
  getLetter,
  sendLetter,
} from "../../services/letter/performance-letter.service";

describe("performance-letter.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  describe("createTemplate", () => {
    it("should create template with defaults", async () => {
      mockDB.create.mockResolvedValue({ id: "tpl-1", type: "appraisal" });
      const result = await createTemplate(ORG, { type: "appraisal", name: "Test", content_template: "Hello {{employee_id}}" });
      expect(result.type).toBe("appraisal");
    });

    it("should create template with is_default true", async () => {
      mockDB.create.mockResolvedValue({ id: "tpl-1" });
      await createTemplate(ORG, { type: "increment", name: "Inc", content_template: "...", is_default: true });
      expect(mockDB.create).toHaveBeenCalledWith("performance_letter_templates", expect.objectContaining({ is_default: true }));
    });
  });

  describe("listTemplates", () => {
    it("should list with type filter", async () => {
      mockDB.findMany.mockResolvedValue({ data: [{ id: "tpl-1" }], total: 1, page: 1, limit: 1000, totalPages: 1 });
      const result = await listTemplates(ORG, "appraisal");
      expect(result).toHaveLength(1);
    });

    it("should list all types", async () => {
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 1000, totalPages: 0 });
      await listTemplates(ORG);
      expect(mockDB.findMany).toHaveBeenCalled();
    });
  });

  describe("getTemplate", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(getTemplate(ORG, "x")).rejects.toThrow("LetterTemplate");
    });

    it("should return template", async () => {
      mockDB.findOne.mockResolvedValue({ id: "tpl-1" });
      const result = await getTemplate(ORG, "tpl-1");
      expect(result.id).toBe("tpl-1");
    });
  });

  describe("updateTemplate", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(updateTemplate(ORG, "x", { name: "New" })).rejects.toThrow("LetterTemplate");
    });

    it("should update all fields", async () => {
      mockDB.findOne.mockResolvedValue({ id: "tpl-1" });
      mockDB.update.mockResolvedValue({ id: "tpl-1", name: "Updated" });
      await updateTemplate(ORG, "tpl-1", { name: "Updated", type: "promotion", content_template: "New", is_default: false });
      expect(mockDB.update).toHaveBeenCalled();
    });
  });

  describe("deleteTemplate", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(deleteTemplate(ORG, "x")).rejects.toThrow("LetterTemplate");
    });

    it("should delete template", async () => {
      mockDB.findOne.mockResolvedValue({ id: "tpl-1" });
      mockDB.delete.mockResolvedValue(true);
      await deleteTemplate(ORG, "tpl-1");
      expect(mockDB.delete).toHaveBeenCalledWith("performance_letter_templates", "tpl-1");
    });
  });

  describe("generateLetter", () => {
    it("should throw if template not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(generateLetter(ORG, 10, "x", null, 20)).rejects.toThrow("LetterTemplate");
    });

    it("should generate letter without cycle", async () => {
      mockDB.findOne.mockResolvedValue({ id: "tpl-1", type: "appraisal", content_template: "Dear Employee {{employee_id}}" });
      mockDB.create.mockResolvedValue({ id: "letter-1", content: "Dear Employee 10" });
      const result = await generateLetter(ORG, 10, "tpl-1", null, 20);
      expect(result.content).toContain("10");
    });

    it("should generate letter with cycle and review data", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "tpl-1", type: "appraisal", content_template: "Rating: {{overall_rating}}" }) // template
        .mockResolvedValueOnce({ overall_rating: 4.5, summary: "Good", strengths: "Strong", improvements: "Better" }); // review
      mockDB.create.mockResolvedValue({ id: "letter-1", content: "Rating: 4.5" });
      const result = await generateLetter(ORG, 10, "tpl-1", "c-1", 20);
      expect(result.content).toContain("4.5");
    });

    it("should generate letter with cycle but no review", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "tpl-1", type: "increment", content_template: "Cycle: {{cycle_id}}" })
        .mockResolvedValueOnce(null); // no review
      mockDB.create.mockResolvedValue({ id: "letter-1" });
      await generateLetter(ORG, 10, "tpl-1", "c-1", 20);
      expect(mockDB.create).toHaveBeenCalled();
    });
  });

  describe("listLetters", () => {
    it("should list with all filters", async () => {
      mockDB.findMany.mockResolvedValue({ data: [{ id: "l-1" }], total: 1, page: 1, limit: 20, totalPages: 1 });
      const result = await listLetters(ORG, { employeeId: 10, type: "appraisal", page: 2, perPage: 5 });
      expect(result.data).toHaveLength(1);
    });

    it("should use defaults", async () => {
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
      const result = await listLetters(ORG, {});
      expect(result.page).toBe(1);
      expect(result.perPage).toBe(20);
    });
  });

  describe("getLetter", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(getLetter(ORG, "x")).rejects.toThrow("PerformanceLetter");
    });

    it("should return letter", async () => {
      mockDB.findOne.mockResolvedValue({ id: "l-1" });
      const result = await getLetter(ORG, "l-1");
      expect(result.id).toBe("l-1");
    });
  });

  describe("sendLetter", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(sendLetter(ORG, "x")).rejects.toThrow("PerformanceLetter");
    });

    it("should throw if already sent", async () => {
      mockDB.findOne.mockResolvedValue({ id: "l-1", sent_at: "2026-01-01" });
      await expect(sendLetter(ORG, "l-1")).rejects.toThrow("already been sent");
    });

    it("should mark letter as sent", async () => {
      mockDB.findOne.mockResolvedValue({ id: "l-1", sent_at: null });
      mockDB.update.mockResolvedValue({ id: "l-1", sent_at: new Date() });
      const result = await sendLetter(ORG, "l-1");
      expect(result.sent_at).toBeTruthy();
    });
  });
});

// =========================================================================
// Manager Effectiveness Service
// =========================================================================
import {
  calculateScore,
  listManagerScores,
  getManagerDetail,
  getDashboard,
  calculateAll,
} from "../../services/manager-effectiveness/manager-effectiveness.service";

describe("manager-effectiveness.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    mockDB.raw.mockResolvedValue([[]]);
    mockDB.count.mockResolvedValue(0);
  });

  describe("calculateScore", () => {
    it("should throw for invalid period format", async () => {
      await expect(calculateScore(ORG, 10, "2026")).rejects.toThrow("period");
      await expect(calculateScore(ORG, 10, "2026-Q5")).rejects.toThrow("period");
      await expect(calculateScore(ORG, 10, "")).rejects.toThrow("period");
    });

    it("should calculate score with no team", async () => {
      mockDB.raw.mockResolvedValue([[]]); // no direct reports
      mockDB.findOne.mockResolvedValue(null); // no existing
      mockDB.create.mockResolvedValue({ id: "ms-1", overall_score: null });

      const result = await calculateScore(ORG, 10, "2026-Q1");
      expect(result).toBeTruthy();
    });

    it("should calculate score with team and reviews", async () => {
      // direct reports
      mockDB.raw
        .mockResolvedValueOnce([[{ employee_id: 100 }, { employee_id: 101 }]]) // direct reports
        .mockResolvedValueOnce([[{ avg_rating: 4.0 }]]) // team rating
        .mockResolvedValueOnce([[{ id: "r-1", overall_rating: 4, submitted_at: "2026-02-01", review_deadline: "2026-03-01" }]]) // manager reviews
        .mockResolvedValueOnce([[{ cnt: 3 }]]) // meetings
        .mockResolvedValueOnce([[{ cnt: 5 }]]) // feedback
        .mockResolvedValueOnce([[{ total: 10, completed: 8 }]]); // goals

      mockDB.findOne.mockResolvedValue(null); // no existing score
      mockDB.create.mockResolvedValue({ id: "ms-1" });

      await calculateScore(ORG, 10, "2026-Q1");
      expect(mockDB.create).toHaveBeenCalled();
    });

    it("should update existing score", async () => {
      mockDB.raw.mockResolvedValue([[]]);
      mockDB.findOne.mockResolvedValue({ id: "ms-existing" });
      mockDB.update.mockResolvedValue({ id: "ms-existing" });

      await calculateScore(ORG, 10, "2026-Q2");
      expect(mockDB.update).toHaveBeenCalled();
    });

    it("should handle high rating variance", async () => {
      mockDB.raw
        .mockResolvedValueOnce([[{ employee_id: 100 }]])
        .mockResolvedValueOnce([[{ avg_rating: 3.5 }]])
        .mockResolvedValueOnce([[
          { id: "r-1", overall_rating: 1, submitted_at: "2026-02-01", review_deadline: "2026-03-01" },
          { id: "r-2", overall_rating: 5, submitted_at: "2026-02-01", review_deadline: "2026-03-01" },
        ]])
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        .mockResolvedValueOnce([[{ total: 0, completed: 0 }]]);

      mockDB.findOne.mockResolvedValue(null);
      mockDB.create.mockResolvedValue({ id: "ms-1" });

      await calculateScore(ORG, 10, "2026-Q3");
      expect(mockDB.create).toHaveBeenCalled();
    });

    it("should handle low rating variance (rubber-stamping)", async () => {
      mockDB.raw
        .mockResolvedValueOnce([[{ employee_id: 100 }]])
        .mockResolvedValueOnce([[{ avg_rating: 3.0 }]])
        .mockResolvedValueOnce([[
          { id: "r-1", overall_rating: 3.0, submitted_at: "2026-02-01", review_deadline: "2026-03-01" },
          { id: "r-2", overall_rating: 3.01, submitted_at: "2026-02-01", review_deadline: "2026-03-01" },
        ]])
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        .mockResolvedValueOnce([[{ cnt: 0 }]])
        .mockResolvedValueOnce([[{ total: 0, completed: 0 }]]);

      mockDB.findOne.mockResolvedValue(null);
      mockDB.create.mockResolvedValue({ id: "ms-1" });

      await calculateScore(ORG, 10, "2026-Q4");
      expect(mockDB.create).toHaveBeenCalled();
    });
  });

  describe("listManagerScores", () => {
    it("should list scores", async () => {
      mockDB.findMany.mockResolvedValue({ data: [{ id: "ms-1" }], total: 1, page: 1, limit: 1000, totalPages: 1 });
      const result = await listManagerScores(ORG, "2026-Q1");
      expect(result).toHaveLength(1);
    });
  });

  describe("getManagerDetail", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(getManagerDetail(ORG, 10, "2026-Q1")).rejects.toThrow("ManagerEffectivenessScore");
    });

    it("should return detail with breakdown - with team rating", async () => {
      mockDB.findOne.mockResolvedValue({
        id: "ms-1", manager_user_id: 10, period: "2026-Q1",
        avg_team_rating: 4.0, team_size: 5,
        reviews_completed_on_time_pct: 80,
        one_on_one_frequency: 3, feedback_given_count: 10, goal_completion_rate: 70,
        overall_score: 75,
      });

      const result = await getManagerDetail(ORG, 10, "2026-Q1");
      expect(result.breakdown.team_performance.description).toContain("4");
      expect(result.breakdown.review_quality.description).toContain("80%");
      expect(result.breakdown.engagement.description).toContain("3");
    });

    it("should return detail with no ratings", async () => {
      mockDB.findOne.mockResolvedValue({
        id: "ms-1", manager_user_id: 10, period: "2026-Q1",
        avg_team_rating: null, team_size: 2,
        reviews_completed_on_time_pct: null,
        one_on_one_frequency: null, feedback_given_count: 0, goal_completion_rate: null,
        overall_score: null,
      });

      const result = await getManagerDetail(ORG, 10, "2026-Q1");
      expect(result.breakdown.team_performance.description).toContain("no ratings");
      expect(result.breakdown.review_quality.description).toContain("No manager reviews");
    });
  });

  describe("getDashboard", () => {
    it("should return empty dashboard when no data", async () => {
      mockDB.raw.mockResolvedValue([[]]);
      const result = await getDashboard(ORG);
      expect(result.total_managers).toBe(0);
      expect(result.period).toBe("");
    });

    it("should return full dashboard", async () => {
      mockDB.raw
        .mockResolvedValueOnce([[{ period: "2026-Q1", org_avg: 72.5, total: 10 }]]) // latest
        .mockResolvedValueOnce([[{ bucket: "60-80", cnt: 5 }, { bucket: "80-100", cnt: 3 }]]); // distribution
      mockDB.findMany
        .mockResolvedValueOnce({ data: [{ id: "ms-1" }], total: 1, page: 1, limit: 5, totalPages: 1 }) // top
        .mockResolvedValueOnce({ data: [{ id: "ms-2" }], total: 1, page: 1, limit: 5, totalPages: 1 }); // bottom

      const result = await getDashboard(ORG);
      expect(result.total_managers).toBe(10);
      expect(result.period).toBe("2026-Q1");
      expect(result.score_distribution["60-80"]).toBe(5);
    });
  });

  describe("calculateAll", () => {
    it("should throw for invalid period", async () => {
      await expect(calculateAll(ORG, "bad")).rejects.toThrow("period");
    });

    it("should batch calculate for all managers", async () => {
      mockDB.raw
        .mockResolvedValueOnce([[{ manager_id: 10 }, { manager_id: 20 }]]) // managers
        .mockResolvedValue([[]]); // subsequent calls for calculateScore
      mockDB.findOne.mockResolvedValue(null);
      mockDB.create.mockResolvedValue({ id: "ms-1" });

      const result = await calculateAll(ORG, "2026-Q1");
      expect(result.calculated + result.errors).toBe(2);
    });
  });
});

// =========================================================================
// Notification Settings Service
// =========================================================================
import {
  getNotificationSettings,
  updateNotificationSettings,
} from "../../services/notification/notification-settings.service";

describe("notification-settings.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getNotificationSettings", () => {
    it("should return existing settings", async () => {
      mockDB.findOne.mockResolvedValue({ id: "ns-1", review_reminders_enabled: true });
      const result = await getNotificationSettings(ORG);
      expect(result.id).toBe("ns-1");
    });

    it("should return defaults when no settings exist", async () => {
      mockDB.findOne.mockResolvedValue(null);
      const result = await getNotificationSettings(ORG);
      expect(result.id).toBe("");
      expect(result.review_reminders_enabled).toBe(true);
      expect(result.rating_scale).toBe(5);
    });

    it("should return defaults on DB error", async () => {
      mockDB.findOne.mockRejectedValue(new Error("table not found"));
      const result = await getNotificationSettings(ORG);
      expect(result.id).toBe("");
      expect(result.review_reminders_enabled).toBe(true);
    });
  });

  describe("updateNotificationSettings", () => {
    it("should update existing settings", async () => {
      mockDB.findOne.mockResolvedValue({ id: "ns-1" });
      mockDB.update.mockResolvedValue({ id: "ns-1", review_reminders_enabled: false });
      const result = await updateNotificationSettings(ORG, { review_reminders_enabled: false });
      expect(result.review_reminders_enabled).toBe(false);
    });

    it("should create new settings when none exist", async () => {
      mockDB.findOne.mockResolvedValue(null);
      mockDB.create.mockResolvedValue({ id: "ns-new", rating_scale: 10 });
      const result = await updateNotificationSettings(ORG, {
        review_reminders_enabled: false,
        pip_reminders_enabled: false,
        meeting_reminders_enabled: false,
        goal_reminders_enabled: false,
        reminder_days_before_deadline: 5,
        rating_scale: 10,
        default_framework: "fw-1",
      });
      expect(result.rating_scale).toBe(10);
    });

    it("should handle DB error on findOne", async () => {
      mockDB.findOne.mockRejectedValue(new Error("table error"));
      mockDB.create.mockResolvedValue({ id: "ns-new" });
      await updateNotificationSettings(ORG, { rating_scale: 3 });
      expect(mockDB.create).toHaveBeenCalled();
    });
  });
});

// =========================================================================
// One-on-One Service
// =========================================================================
import {
  createMeeting,
  listMeetings,
  getMeeting,
  updateMeeting,
  completeMeeting,
  addAgendaItem,
  updateAgendaItem,
  completeAgendaItem,
} from "../../services/one-on-one/one-on-one.service";

describe("one-on-one.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  describe("createMeeting", () => {
    it("should create meeting with defaults", async () => {
      mockDB.create.mockResolvedValue({ id: "m-1", title: "Weekly" });
      const result = await createMeeting(ORG, { employee_id: 10, manager_id: 20, title: "Weekly", scheduled_at: "2026-04-10T10:00:00Z" });
      expect(result.title).toBe("Weekly");
    });

    it("should create meeting with custom duration", async () => {
      mockDB.create.mockResolvedValue({ id: "m-1" });
      await createMeeting(ORG, { employee_id: 10, manager_id: 20, title: "Deep dive", scheduled_at: "2026-04-10T10:00:00Z", duration_minutes: 60 });
      expect(mockDB.create).toHaveBeenCalledWith("one_on_one_meetings", expect.objectContaining({ duration_minutes: 60 }));
    });
  });

  describe("listMeetings", () => {
    it("should list with filters", async () => {
      mockDB.findMany.mockResolvedValue({ data: [{ id: "m-1" }], total: 1, page: 1, limit: 20, totalPages: 1 });
      await listMeetings(ORG, { managerId: 20, employeeId: 10, status: "scheduled", page: 2, limit: 10 });
      expect(mockDB.findMany).toHaveBeenCalledWith("one_on_one_meetings", expect.objectContaining({
        filters: expect.objectContaining({ manager_id: 20, employee_id: 10, status: "scheduled" }),
      }));
    });

    it("should list with defaults", async () => {
      await listMeetings(ORG);
      expect(mockDB.findMany).toHaveBeenCalledWith("one_on_one_meetings", expect.objectContaining({ page: 1, limit: 20 }));
    });
  });

  describe("getMeeting", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(getMeeting(ORG, "x")).rejects.toThrow("Meeting");
    });

    it("should return meeting with agenda items", async () => {
      mockDB.findOne.mockResolvedValue({ id: "m-1" });
      mockDB.findMany.mockResolvedValue({ data: [{ id: "ai-1" }], total: 1, page: 1, limit: 100, totalPages: 1 });
      const result = await getMeeting(ORG, "m-1");
      expect(result.agendaItems).toHaveLength(1);
    });
  });

  describe("updateMeeting", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(updateMeeting(ORG, "x", { title: "New" })).rejects.toThrow("Meeting");
    });

    it("should update all fields", async () => {
      mockDB.findOne.mockResolvedValue({ id: "m-1" });
      mockDB.update.mockResolvedValue({ id: "m-1" });
      await updateMeeting(ORG, "m-1", {
        title: "Updated", scheduled_at: "2026-05-01T10:00:00Z", duration_minutes: 45,
        meeting_notes: "Notes", action_items: "Actions",
      });
      expect(mockDB.update).toHaveBeenCalled();
    });
  });

  describe("completeMeeting", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(completeMeeting(ORG, "x")).rejects.toThrow("Meeting");
    });

    it("should throw if already completed", async () => {
      mockDB.findOne.mockResolvedValue({ id: "m-1", status: "completed" });
      await expect(completeMeeting(ORG, "m-1")).rejects.toThrow("already completed");
    });

    it("should complete meeting", async () => {
      mockDB.findOne.mockResolvedValue({ id: "m-1", status: "scheduled" });
      mockDB.update.mockResolvedValue({ id: "m-1", status: "completed" });
      const result = await completeMeeting(ORG, "m-1");
      expect(result.status).toBe("completed");
    });
  });

  describe("addAgendaItem", () => {
    it("should throw if meeting not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(addAgendaItem(ORG, "x", { title: "Item", added_by: 10 })).rejects.toThrow("Meeting");
    });

    it("should add agenda item with defaults", async () => {
      mockDB.findOne.mockResolvedValue({ id: "m-1" });
      mockDB.create.mockResolvedValue({ id: "ai-1" });
      await addAgendaItem(ORG, "m-1", { title: "Discuss", added_by: 10 });
      expect(mockDB.create).toHaveBeenCalledWith("meeting_agenda_items", expect.objectContaining({
        description: null, order: 0, is_discussed: false,
      }));
    });

    it("should add agenda item with all fields", async () => {
      mockDB.findOne.mockResolvedValue({ id: "m-1" });
      mockDB.create.mockResolvedValue({ id: "ai-1" });
      await addAgendaItem(ORG, "m-1", { title: "Item", description: "Details", added_by: 10, order: 3 });
      expect(mockDB.create).toHaveBeenCalledWith("meeting_agenda_items", expect.objectContaining({ order: 3 }));
    });
  });

  describe("updateAgendaItem", () => {
    it("should throw if item not found", async () => {
      mockDB.findById.mockResolvedValue(null);
      await expect(updateAgendaItem(ORG, "x", { title: "New" })).rejects.toThrow("Agenda item");
    });

    it("should throw if meeting not in org", async () => {
      mockDB.findById.mockResolvedValue({ id: "ai-1", meeting_id: "m-1" });
      mockDB.findOne.mockResolvedValue(null);
      await expect(updateAgendaItem(ORG, "ai-1", { title: "New" })).rejects.toThrow("Meeting");
    });

    it("should update agenda item", async () => {
      mockDB.findById.mockResolvedValue({ id: "ai-1", meeting_id: "m-1" });
      mockDB.findOne.mockResolvedValue({ id: "m-1" });
      mockDB.update.mockResolvedValue({ id: "ai-1", title: "Updated" });
      const result = await updateAgendaItem(ORG, "ai-1", { title: "Updated", description: "New", order: 2 });
      expect(result.title).toBe("Updated");
    });
  });

  describe("completeAgendaItem", () => {
    it("should throw if item not found", async () => {
      mockDB.findById.mockResolvedValue(null);
      await expect(completeAgendaItem(ORG, "x")).rejects.toThrow("Agenda item");
    });

    it("should throw if meeting not in org", async () => {
      mockDB.findById.mockResolvedValue({ id: "ai-1", meeting_id: "m-1" });
      mockDB.findOne.mockResolvedValue(null);
      await expect(completeAgendaItem(ORG, "ai-1")).rejects.toThrow("Meeting");
    });

    it("should mark as discussed", async () => {
      mockDB.findById.mockResolvedValue({ id: "ai-1", meeting_id: "m-1" });
      mockDB.findOne.mockResolvedValue({ id: "m-1" });
      mockDB.update.mockResolvedValue({ id: "ai-1", is_discussed: true });
      const result = await completeAgendaItem(ORG, "ai-1");
      expect(result.is_discussed).toBe(true);
    });
  });
});

// =========================================================================
// Peer Review Service
// =========================================================================
import {
  nominate,
  listNominations,
  approveNomination,
  declineNomination,
} from "../../services/peer-review/peer-review.service";

describe("peer-review.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  describe("nominate", () => {
    it("should throw if cycle not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(nominate(ORG, "x", 10, 20, 10)).rejects.toThrow("Review cycle");
    });

    it("should throw on self-nomination", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1" });
      await expect(nominate(ORG, "c-1", 10, 10, 10)).rejects.toThrow("self");
    });

    it("should throw on duplicate nomination", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "c-1" }) // cycle
        .mockResolvedValueOnce({ id: "nom-existing" }); // existing
      await expect(nominate(ORG, "c-1", 10, 20, 10)).rejects.toThrow("already been nominated");
    });

    it("should create nomination", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "c-1" }) // cycle
        .mockResolvedValueOnce(null); // no existing
      mockDB.create.mockResolvedValue({ id: "nom-1", status: "pending" });
      const result = await nominate(ORG, "c-1", 10, 20, 10);
      expect(result.status).toBe("pending");
    });
  });

  describe("listNominations", () => {
    it("should throw if cycle not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(listNominations(ORG, "x")).rejects.toThrow("Review cycle");
    });

    it("should list with filters", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1" });
      mockDB.findMany.mockResolvedValue({ data: [{ id: "nom-1" }], total: 1, page: 1, limit: 50, totalPages: 1 });
      await listNominations(ORG, "c-1", { employeeId: 10, nomineeId: 20, status: "pending", page: 2, limit: 10 });
      expect(mockDB.findMany).toHaveBeenCalled();
    });
  });

  describe("approveNomination", () => {
    it("should throw if not found", async () => {
      mockDB.findById.mockResolvedValue(null);
      await expect(approveNomination(ORG, "x", 20)).rejects.toThrow("Peer nomination");
    });

    it("should throw if cycle not in org", async () => {
      mockDB.findById.mockResolvedValue({ id: "nom-1", cycle_id: "c-1", status: "pending" });
      mockDB.findOne.mockResolvedValue(null);
      await expect(approveNomination(ORG, "nom-1", 20)).rejects.toThrow("Review cycle");
    });

    it("should throw if not pending", async () => {
      mockDB.findById.mockResolvedValue({ id: "nom-1", cycle_id: "c-1", status: "approved" });
      mockDB.findOne.mockResolvedValue({ id: "c-1" });
      await expect(approveNomination(ORG, "nom-1", 20)).rejects.toThrow("approve nomination");
    });

    it("should approve nomination", async () => {
      mockDB.findById.mockResolvedValue({ id: "nom-1", cycle_id: "c-1", status: "pending" });
      mockDB.findOne.mockResolvedValue({ id: "c-1" });
      mockDB.update.mockResolvedValue({ id: "nom-1", status: "approved" });
      const result = await approveNomination(ORG, "nom-1", 20);
      expect(result.status).toBe("approved");
    });
  });

  describe("declineNomination", () => {
    it("should throw if not found", async () => {
      mockDB.findById.mockResolvedValue(null);
      await expect(declineNomination(ORG, "x", 20)).rejects.toThrow("Peer nomination");
    });

    it("should throw if cycle not in org", async () => {
      mockDB.findById.mockResolvedValue({ id: "nom-1", cycle_id: "c-1", status: "pending" });
      mockDB.findOne.mockResolvedValue(null);
      await expect(declineNomination(ORG, "nom-1", 20)).rejects.toThrow("Review cycle");
    });

    it("should throw if not pending", async () => {
      mockDB.findById.mockResolvedValue({ id: "nom-1", cycle_id: "c-1", status: "declined" });
      mockDB.findOne.mockResolvedValue({ id: "c-1" });
      await expect(declineNomination(ORG, "nom-1", 20)).rejects.toThrow("decline nomination");
    });

    it("should decline nomination", async () => {
      mockDB.findById.mockResolvedValue({ id: "nom-1", cycle_id: "c-1", status: "pending" });
      mockDB.findOne.mockResolvedValue({ id: "c-1" });
      mockDB.update.mockResolvedValue({ id: "nom-1", status: "declined" });
      const result = await declineNomination(ORG, "nom-1", 20);
      expect(result.status).toBe("declined");
    });
  });
});

// =========================================================================
// PIP Service
// =========================================================================
import {
  createPIP,
  listPIPs,
  getPIP,
  updatePIP,
  addObjective,
  updateObjective,
  addUpdate,
  closePIP,
  extendPIP,
} from "../../services/pip/pip.service";

describe("pip.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  describe("createPIP", () => {
    it("should throw if employee has active PIP", async () => {
      mockDB.findOne.mockResolvedValue({ id: "pip-existing", status: "active" });
      await expect(createPIP(ORG, 20, { employee_id: 10, reason: "Underperformance", start_date: "2026-01-01", end_date: "2026-03-31" })).rejects.toThrow("active");
    });

    it("should create PIP with defaults", async () => {
      mockDB.findOne.mockResolvedValue(null);
      mockDB.create.mockResolvedValue({ id: "pip-1", status: "active" });
      const result = await createPIP(ORG, 20, { employee_id: 10, reason: "Poor performance", start_date: "2026-01-01", end_date: "2026-03-31" });
      expect(result.status).toBe("active");
      expect(mockDB.create).toHaveBeenCalledWith("performance_improvement_plans", expect.objectContaining({
        manager_id: 20,
      }));
    });

    it("should create PIP with custom manager", async () => {
      mockDB.findOne.mockResolvedValue(null);
      mockDB.create.mockResolvedValue({ id: "pip-1" });
      await createPIP(ORG, 20, { employee_id: 10, manager_id: 30, reason: "Test", start_date: "2026-01-01", end_date: "2026-03-31" });
      expect(mockDB.create).toHaveBeenCalledWith("performance_improvement_plans", expect.objectContaining({
        manager_id: 30,
      }));
    });
  });

  describe("listPIPs", () => {
    it("should list with all filters", async () => {
      mockDB.findMany.mockResolvedValue({ data: [{ id: "pip-1" }], total: 1, page: 1, limit: 10, totalPages: 1 });
      const result = await listPIPs(ORG, { status: "active", employeeId: 10, managerId: 20, page: 2, perPage: 10, sort: "start_date", order: "asc" });
      expect(result.data).toHaveLength(1);
    });
  });

  describe("getPIP", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(getPIP(ORG, "x")).rejects.toThrow("PIP");
    });

    it("should return PIP with objectives and updates", async () => {
      mockDB.findOne.mockResolvedValue({ id: "pip-1" });
      mockDB.findMany
        .mockResolvedValueOnce({ data: [{ id: "obj-1" }], total: 1, page: 1, limit: 100, totalPages: 1 })
        .mockResolvedValueOnce({ data: [{ id: "upd-1" }], total: 1, page: 1, limit: 100, totalPages: 1 });

      const result = await getPIP(ORG, "pip-1");
      expect(result.objectives).toHaveLength(1);
      expect(result.updates).toHaveLength(1);
    });
  });

  describe("updatePIP", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(updatePIP(ORG, "x", { reason: "New" })).rejects.toThrow("PIP");
    });

    it("should update PIP fields", async () => {
      mockDB.findOne.mockResolvedValue({ id: "pip-1" });
      mockDB.update.mockResolvedValue({ id: "pip-1", reason: "Updated" });
      await updatePIP(ORG, "pip-1", { reason: "Updated", end_date: "2026-06-30", outcome_notes: "Improving" });
      expect(mockDB.update).toHaveBeenCalled();
    });
  });

  describe("addObjective", () => {
    it("should throw if PIP not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(addObjective(ORG, "x", { title: "Obj" })).rejects.toThrow("PIP");
    });

    it("should add objective with defaults", async () => {
      mockDB.findOne.mockResolvedValue({ id: "pip-1" });
      mockDB.create.mockResolvedValue({ id: "obj-1" });
      await addObjective(ORG, "pip-1", { title: "Improve" });
      expect(mockDB.create).toHaveBeenCalledWith("pip_objectives", expect.objectContaining({
        description: null,
        success_criteria: null,
        due_date: null,
        status: "not_started",
      }));
    });

    it("should add objective with all fields", async () => {
      mockDB.findOne.mockResolvedValue({ id: "pip-1" });
      mockDB.create.mockResolvedValue({ id: "obj-1" });
      await addObjective(ORG, "pip-1", { title: "Improve", description: "Details", success_criteria: "Criteria", due_date: "2026-03-01" });
      expect(mockDB.create).toHaveBeenCalled();
    });
  });

  describe("updateObjective", () => {
    it("should throw if PIP not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(updateObjective(ORG, "x", "obj-1", { title: "New" })).rejects.toThrow("PIP");
    });

    it("should throw if objective not found", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "pip-1" }).mockResolvedValueOnce(null);
      await expect(updateObjective(ORG, "pip-1", "obj-x", { title: "New" })).rejects.toThrow("PIP Objective");
    });

    it("should update objective", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "pip-1" }).mockResolvedValueOnce({ id: "obj-1" });
      mockDB.update.mockResolvedValue({ id: "obj-1", title: "Updated" });
      await updateObjective(ORG, "pip-1", "obj-1", {
        title: "Updated", description: "New", success_criteria: "New criteria",
        due_date: "2026-04-01", status: "in_progress",
      });
      expect(mockDB.update).toHaveBeenCalled();
    });
  });

  describe("addUpdate", () => {
    it("should throw if PIP not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(addUpdate(ORG, "x", 20, { notes: "Note" })).rejects.toThrow("PIP");
    });

    it("should add update", async () => {
      mockDB.findOne.mockResolvedValue({ id: "pip-1" });
      mockDB.create.mockResolvedValue({ id: "upd-1" });
      await addUpdate(ORG, "pip-1", 20, { notes: "Progress update", progress_rating: 3 });
      expect(mockDB.create).toHaveBeenCalledWith("pip_updates", expect.objectContaining({
        author_id: 20,
        progress_rating: 3,
      }));
    });

    it("should add update with defaults", async () => {
      mockDB.findOne.mockResolvedValue({ id: "pip-1" });
      mockDB.create.mockResolvedValue({ id: "upd-1" });
      await addUpdate(ORG, "pip-1", 20, { notes: "Note" });
      expect(mockDB.create).toHaveBeenCalledWith("pip_updates", expect.objectContaining({
        progress_rating: null,
      }));
    });
  });

  describe("closePIP", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(closePIP(ORG, "x", "completed_success")).rejects.toThrow("PIP");
    });

    it("should throw if status is not active/extended", async () => {
      mockDB.findOne.mockResolvedValue({ id: "pip-1", status: "completed_success" });
      await expect(closePIP(ORG, "pip-1", "completed_success")).rejects.toThrow("INVALID_STATUS");
    });

    it("should close active PIP as success", async () => {
      mockDB.findOne.mockResolvedValue({ id: "pip-1", status: "active" });
      mockDB.update.mockResolvedValue({ id: "pip-1", status: "completed_success" });
      const result = await closePIP(ORG, "pip-1", "completed_success", "Great improvement");
      expect(result.status).toBe("completed_success");
    });

    it("should close extended PIP as failure", async () => {
      mockDB.findOne.mockResolvedValue({ id: "pip-1", status: "extended" });
      mockDB.update.mockResolvedValue({ id: "pip-1", status: "completed_failure" });
      const result = await closePIP(ORG, "pip-1", "completed_failure");
      expect(result.status).toBe("completed_failure");
    });

    it("should close as cancelled", async () => {
      mockDB.findOne.mockResolvedValue({ id: "pip-1", status: "active" });
      mockDB.update.mockResolvedValue({ id: "pip-1", status: "cancelled" });
      await closePIP(ORG, "pip-1", "cancelled");
      expect(mockDB.update).toHaveBeenCalled();
    });
  });

  describe("extendPIP", () => {
    it("should throw if not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(extendPIP(ORG, "x", "2026-06-30")).rejects.toThrow("PIP");
    });

    it("should throw if not active/extended", async () => {
      mockDB.findOne.mockResolvedValue({ id: "pip-1", status: "completed_success" });
      await expect(extendPIP(ORG, "pip-1", "2026-06-30")).rejects.toThrow("INVALID_STATUS");
    });

    it("should extend PIP", async () => {
      mockDB.findOne.mockResolvedValue({ id: "pip-1", status: "active" });
      mockDB.update.mockResolvedValue({ id: "pip-1", status: "extended" });
      const result = await extendPIP(ORG, "pip-1", "2026-06-30");
      expect(result.status).toBe("extended");
    });

    it("should extend already extended PIP", async () => {
      mockDB.findOne.mockResolvedValue({ id: "pip-1", status: "extended" });
      mockDB.update.mockResolvedValue({ id: "pip-1", status: "extended" });
      await extendPIP(ORG, "pip-1", "2026-09-30");
      expect(mockDB.update).toHaveBeenCalledWith("performance_improvement_plans", "pip-1", expect.objectContaining({
        extended_end_date: "2026-09-30",
      }));
    });
  });
});
