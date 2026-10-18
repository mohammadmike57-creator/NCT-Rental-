package com.carrental.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;

import javax.sql.DataSource;
import java.sql.Connection;

@Configuration
public class DatabaseMigrationConfig {

    private static final Logger logger = LoggerFactory.getLogger(DatabaseMigrationConfig.class);

    @Bean
    public InitializingBean migrateDatabase(DataSource dataSource) {
        return () -> {
            try (Connection connection = dataSource.getConnection()) {
                String productName = connection.getMetaData().getDatabaseProductName();
                if ("PostgreSQL".equalsIgnoreCase(productName)) {
                    JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
                    logger.info("Running PostgreSQL migration for application state and reservation dates...");
                    jdbcTemplate.execute("DO $$\n" +
                            "BEGIN\n" +
                            "  CREATE TABLE IF NOT EXISTS app_data (id varchar(255) PRIMARY KEY, data TEXT NOT NULL);\n" +
                            "  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_data' AND column_name='data' AND data_type <> 'text') THEN\n" +
                            "    ALTER TABLE app_data ALTER COLUMN data TYPE TEXT USING data::text;\n" +
                            "  END IF;\n" +
                            "  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='reservations') THEN\n" +
                            "    -- Fix start_date\n" +
                            "    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reservations' AND column_name='start_date' AND data_type <> 'date') THEN\n" +
                            "      ALTER TABLE reservations ALTER COLUMN start_date TYPE DATE USING start_date::date;\n" +
                            "    END IF;\n" +
                            "    -- Fix end_date\n" +
                            "    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reservations' AND column_name='end_date' AND data_type <> 'date') THEN\n" +
                            "      ALTER TABLE reservations ALTER COLUMN end_date TYPE DATE USING end_date::date;\n" +
                            "    END IF;\n" +
                            "    -- Fix booking_date\n" +
                            "    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reservations' AND column_name='booking_date' AND data_type <> 'date') THEN\n" +
                            "      ALTER TABLE reservations ALTER COLUMN booking_date TYPE DATE USING booking_date::date;\n" +
                            "    END IF;\n" +
                            "  END IF;\n" +
                            "END $$;");
                    logger.info("PostgreSQL migration for application state and reservation dates completed.");
                    // Hibernate 6 adds CHECK constraints listing enum values when it creates a table.
                    // ddl-auto=update never refreshes them, so new permissions would be rejected.
                    jdbcTemplate.execute("DO $$\n" +
                            "DECLARE r record;\n" +
                            "BEGIN\n" +
                            "  FOR r IN SELECT c.conname FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid\n" +
                            "           WHERE t.relname = 'user_permissions' AND c.contype = 'c' LOOP\n" +
                            "    EXECUTE 'ALTER TABLE user_permissions DROP CONSTRAINT ' || quote_ident(r.conname);\n" +
                            "  END LOOP;\n" +
                            "END $$;");
                    logger.info("Permission check constraints refreshed.");
                    // One-time: every sidebar section now has its own permission. Give existing staff the new
                    // ones that match what they could already do, so nobody loses access on upgrade.
                    jdbcTemplate.execute("DO $$\n" +
                            "BEGIN\n" +
                            "  CREATE TABLE IF NOT EXISTS app_migrations (id varchar(100) PRIMARY KEY, applied_at timestamp DEFAULT now());\n" +
                            "  IF EXISTS (SELECT 1 FROM app_migrations WHERE id = 'permissions-per-section-v1') THEN RETURN; END IF;\n" +
                            "  IF to_regclass('user_permissions') IS NOT NULL THEN\n" +
                            "    INSERT INTO user_permissions (user_id, permissions) SELECT DISTINCT user_id, 'VIEW_AGREEMENTS' FROM user_permissions;\n" +
                            "    INSERT INTO user_permissions (user_id, permissions) SELECT DISTINCT user_id, 'ACTION_AGREEMENT_WITHOUT_RESERVATION' FROM user_permissions WHERE permissions = 'ACTION_VOUCHER_MANAGE';\n" +
                            "    INSERT INTO user_permissions (user_id, permissions) SELECT DISTINCT user_id, 'VIEW_UNLISTED_AGREEMENTS' FROM user_permissions WHERE permissions = 'VIEW_RESERVATIONS';\n" +
                            "    INSERT INTO user_permissions (user_id, permissions) SELECT DISTINCT user_id, 'ACTION_UNLISTED_AGREEMENTS_LIST' FROM user_permissions WHERE permissions = 'ACTION_RESERVATIONS_EDIT';\n" +
                            "    INSERT INTO user_permissions (user_id, permissions) SELECT DISTINCT user_id, 'VIEW_IMPORT_RESERVATIONS' FROM user_permissions WHERE permissions = 'VIEW_ADMIN_PANEL';\n" +
                            "    INSERT INTO user_permissions (user_id, permissions) SELECT DISTINCT user_id, 'ACTION_ADMIN_MANAGE_EMAIL_SETTINGS' FROM user_permissions WHERE permissions = 'ACTION_ADMIN_MANAGE_COMPANY_DETAILS';\n" +
                            "  END IF;\n" +
                            "  INSERT INTO app_migrations (id) VALUES ('permissions-per-section-v1');\n" +
                            "END $$;");
                    logger.info("Per-section permissions migration checked.");
                }
            } catch (Exception e) {
                logger.error("Database migration failed", e);
            }
        };
    }

    @Bean
    public static BeanFactoryPostProcessor entityManagerFactoryDependsOnPostProcessor() {
        return beanFactory -> {
            try {
                String[] names = beanFactory.getBeanNamesForType(LocalContainerEntityManagerFactoryBean.class);
                for (String name : names) {
                    BeanDefinition bd = beanFactory.getBeanDefinition(name);
                    String[] dependsOn = bd.getDependsOn();
                    if (dependsOn == null) {
                        bd.setDependsOn("migrateDatabase");
                    } else {
                        boolean alreadyExists = false;
                        for (String d : dependsOn) {
                            if ("migrateDatabase".equals(d)) {
                                alreadyExists = true;
                                break;
                            }
                        }
                        if (!alreadyExists) {
                            String[] newDependsOn = new String[dependsOn.length + 1];
                            System.arraycopy(dependsOn, 0, newDependsOn, 0, dependsOn.length);
                            newDependsOn[dependsOn.length] = "migrateDatabase";
                            bd.setDependsOn(newDependsOn);
                        }
                    }
                }
            } catch (Exception e) {
                // Ignore if we can't find the bean or set dependsOn
            }
        };
    }
}
