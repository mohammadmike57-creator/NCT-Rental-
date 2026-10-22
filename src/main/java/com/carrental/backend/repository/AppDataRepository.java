package com.carrental.backend.repository;

import com.carrental.backend.model.AppData;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface AppDataRepository extends JpaRepository<AppData, String> {
    /** Ids of the automatic hourly backup copies, newest first. */
    @org.springframework.data.jpa.repository.Query("select a.id from AppData a where a.id like 'auto-%' order by a.id desc")
    java.util.List<String> autoBackupIds();

    /** Ids of every backup copy (automatic and before clean-ups or restores), newest first. */
    @org.springframework.data.jpa.repository.Query("select a.id from AppData a where a.id like 'auto-%' or a.id like 'backup-%' order by a.id desc")
    java.util.List<String> backupIds();

    default Optional<AppData> findMain() {
        return findById("main");
    }
}
