package com.carrental.backend.ota;

import org.xml.sax.SAXParseException;
import org.xml.sax.helpers.DefaultHandler;

import javax.xml.XMLConstants;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.Schema;
import javax.xml.validation.SchemaFactory;
import javax.xml.validation.Validator;
import java.io.StringReader;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Checks OTA messages against the official OpenTravel Alliance schemas (release 2017B, namespace OTA/2003/05),
 * kept in src/test/resources/ota-xsd/2017B exactly as published by the OpenTravel Alliance.
 */
final class OfficialOtaSchemas {

    private static final Map<String, Schema> CACHE = new ConcurrentHashMap<>();
    private static final Pattern ROOT = Pattern.compile("<(OTA_[A-Za-z]+)[\\s>/]");

    private OfficialOtaSchemas() {}

    /** Every way the message breaks the official schema; empty when it is valid. */
    static List<String> violations(String xml) {
        Matcher m = ROOT.matcher(xml);
        if (!m.find()) return List.of("no OTA root element");
        String root = m.group(1);
        List<String> problems = new ArrayList<>();
        try {
            Validator v = schema(root).newValidator();
            v.setErrorHandler(new DefaultHandler() {
                @Override public void error(SAXParseException e) { problems.add(root + " line " + e.getLineNumber() + ": " + e.getMessage()); }
                @Override public void fatalError(SAXParseException e) { problems.add(root + " line " + e.getLineNumber() + ": " + e.getMessage()); }
            });
            v.validate(new StreamSource(new StringReader(xml)));
        } catch (Exception e) {
            if (problems.isEmpty()) problems.add(root + ": " + e.getMessage());
        }
        return problems;
    }

    private static Schema schema(String root) {
        return CACHE.computeIfAbsent(root, r -> {
            URL xsd = OfficialOtaSchemas.class.getResource("/ota-xsd/2017B/" + r + ".xsd");
            if (xsd == null) throw new IllegalArgumentException("No official schema for " + r);
            try {
                SchemaFactory f = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
                f.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "file,jar");
                return f.newSchema(xsd);
            } catch (Exception e) {
                throw new IllegalStateException("Official schema for " + r + " could not be loaded: " + e.getMessage(), e);
            }
        });
    }
}
