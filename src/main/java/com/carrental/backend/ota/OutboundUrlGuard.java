package com.carrental.backend.ota;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;

/**
 * Rejects partner endpoint URLs that would make the server call itself or the
 * private network (SSRF). Only public HTTPS endpoints are allowed.
 */
public final class OutboundUrlGuard {

    private OutboundUrlGuard() {}

    public static class BlockedUrlException extends RuntimeException {
        public BlockedUrlException(String message) { super(message); }
    }

    public static URI check(String url) {
        URI uri;
        try {
            uri = URI.create(url.trim());
        } catch (IllegalArgumentException e) {
            throw new BlockedUrlException("Endpoint URL is not valid");
        }
        if (!"https".equalsIgnoreCase(uri.getScheme())) throw new BlockedUrlException("Endpoint must use HTTPS");
        if (uri.getHost() == null || uri.getHost().isBlank()) throw new BlockedUrlException("Endpoint URL has no host");
        if (uri.getUserInfo() != null) throw new BlockedUrlException("Credentials must not be embedded in the URL");
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(uri.getHost());
        } catch (UnknownHostException e) {
            throw new BlockedUrlException("Endpoint host could not be resolved: " + uri.getHost());
        }
        for (InetAddress a : addresses) {
            if (isPrivate(a)) throw new BlockedUrlException("Endpoint resolves to a private or local address");
        }
        return uri;
    }

    static boolean isPrivate(InetAddress a) {
        if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress()
            || a.isSiteLocalAddress() || a.isMulticastAddress()) return true;
        byte[] b = a.getAddress();
        if (b.length == 4) {
            int first = b[0] & 0xff, second = b[1] & 0xff;
            if (first == 100 && second >= 64 && second <= 127) return true; // carrier-grade NAT
            if (first == 0) return true;
        } else if (b.length == 16) {
            if ((b[0] & 0xfe) == 0xfc) return true; // unique local fc00::/7
        }
        return false;
    }
}
