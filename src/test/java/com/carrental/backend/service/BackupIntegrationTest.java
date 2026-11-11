package com.carrental.backend.service;

import com.carrental.backend.model.AppData;
import com.carrental.backend.model.User;
import com.carrental.backend.model.UserPermission;
import com.carrental.backend.model.UserStatus;
import com.carrental.backend.repository.AppDataRepository;
import com.carrental.backend.repository.UserRepository;
import com.carrental.backend.security.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@SpringBootTest(properties = {
    "jwt.secret=test-secret-key-that-is-long-enough-for-hmac-sha256",
    "spring.datasource.url=jdbc:h2:mem:backup-it;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
class BackupIntegrationTest {

    @Autowired StateService state;
    @Autowired AppDataRepository rows;
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtUtil jwt;

    String token(String email, UserPermission... perms) {
        User u = users.findByEmail(email).orElseGet(User::new);
        u.setEmail(email); u.setFullName(email); u.setUsername(email.split("@")[0]); u.setPassword("x");
        u.setStatus(UserStatus.ACTIVE); u.setWebAppAccess(true); u.setPermissions(List.of(perms));
        users.save(u);
        return "Bearer " + jwt.generateToken(email);
    }

    @Test
    void everyUpdateKeepsAFullCopyFirstAndOnlyTheNewestTen() throws Exception {
        state.applyPatch("{\"ops\":[{\"op\":\"upsertReservation\",\"year\":2026,\"month\":\"May\",\"reservation\":{\"id\":\"b1\",\"bookingId\":\"KEEP-1\"}}]}");
        String live = rows.currentMainData().orElseThrow();
        for (int i = 0; i < StateService.UPDATE_BACKUPS_KEPT + 3; i++) { state.backupBeforeUpdate(); Thread.sleep(2); }
        List<String> ids = rows.updateBackupIds();
        assertEquals(StateService.UPDATE_BACKUPS_KEPT, ids.size(), "the newest 10 are kept");
        AppData newest = rows.findById(ids.get(0)).orElseThrow();
        assertEquals(live, newest.getData(), "an exact copy of the data");
        assertTrue(state.listBackups().stream().anyMatch(b -> String.valueOf(b.get("id")).startsWith("backup-before-update-")), "listed for restore");
    }

    @Test
    void anAdministratorDownloadsAllDataWithoutPasswords() throws Exception {
        state.applyPatch("{\"ops\":[{\"op\":\"set\",\"key\":\"users\",\"value\":[{\"id\":\"u1\",\"email\":\"a@nct.test\",\"password\":\"secret-pass\"}]},"
                + "{\"op\":\"upsertReservation\",\"year\":2026,\"month\":\"June\",\"reservation\":{\"id\":\"b2\",\"bookingId\":\"FILE-1\"}}]}");
        var res = mvc.perform(get("/api/state/backup-file").header("Authorization", token("boss@nct.test", UserPermission.ACTION_ADMIN_MANAGE_USERS)))
                .andReturn().getResponse();
        assertEquals(200, res.getStatus());
        assertTrue(res.getHeader("Content-Disposition").matches("attachment; filename=\"nct-backup-\\d{4}-\\d{2}-\\d{2}\\.json\""));
        String body = res.getContentAsString();
        assertTrue(body.contains("FILE-1"), "bookings are in the file");
        assertFalse(body.contains("secret-pass"), "no passwords in the file");
        assertEquals(403, mvc.perform(get("/api/state/backup-file").header("Authorization", token("agent@nct.test", UserPermission.VIEW_RESERVATIONS)))
                .andReturn().getResponse().getStatus(), "staff cannot download all data");
    }
}
