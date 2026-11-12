package com.carrental.backend.monitoring;

import org.junit.jupiter.api.Test;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

/** A page closed or reloaded while the server was answering is not a server error (no alert email). */
class ServerErrorHandlerTest {

    @Test
    void aClosedConnectionIsNotAnError() {
        assertTrue(ServerErrorHandler.clientWentAway(new AsyncRequestNotUsableException(
            "ServletOutputStream failed to write: java.io.IOException: Broken pipe", new IOException("Broken pipe"))));
        assertTrue(ServerErrorHandler.clientWentAway(new RuntimeException("write failed", new IOException("Connection reset by peer"))));
        assertTrue(ServerErrorHandler.clientWentAway(new IOException("Broken pipe")));
    }

    @Test
    void realFaultsAreStillReported() {
        assertFalse(ServerErrorHandler.clientWentAway(new IllegalStateException("The stored data could not be read")));
        assertFalse(ServerErrorHandler.clientWentAway(new IOException("No space left on device")));
        assertFalse(ServerErrorHandler.clientWentAway(new NullPointerException()));
    }
}
