package com.carrental.backend.repository;

import com.carrental.backend.model.AppData;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface AppDataRepository extends JpaRepository<AppData, String> {
    /** Ids of the automatic hourly backup copies, newest first. */
    @org.springframework.data.jpa.repository.Query("select a.id from AppData a where a.id like 'auto-%' order by a.id desc")
    java.util.List<String> autoBackupIds();

    @org.springframework.data.jpa.repository.Query("select a.id from AppData a where a.id like 'backup-before-update-%' order by a.id desc")
    java.util.List<String> updateBackupIds();

    /** Ids of every backup copy (automatic and before clean-ups or restores), newest first. */
    @org.springframework.data.jpa.repository.Query("select a.id from AppData a where a.id like 'auto-%' or a.id like 'backup-%' order by a.id desc")
    java.util.List<String> backupIds();

    /**
     * The saved data read straight from the database. A request keeps the rows it loaded in its own
     * cache for its whole length, so findById can return what was saved when the request began, not
     * what another request saved since; a value query always reads the current row.
     */
    @org.springframework.data.jpa.repository.Query("select a.data from AppData a where a.id = 'main'")
    Optional<String> currentMainData();

    /** The saved data of one row read straight from the database (see currentMainData). */
    @org.springframework.data.jpa.repository.Query("select a.data from AppData a where a.id = :id")
    Optional<String> currentData(@org.springframework.data.repository.query.Param("id") String id);

    /** Row ids starting with {@code prefix} (a LIKE pattern ending in %), newest first. */
    @org.springframework.data.jpa.repository.Query("select a.id from AppData a where a.id like :prefix order by a.id desc")
    java.util.List<String> idsLike(@org.springframework.data.repository.query.Param("prefix") String prefix);

    default Optional<AppData> findMain() {
        return findById("main");
    }
}
