package com.carrental.backend.ota;

import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.xml.sax.InputSource;
import org.xml.sax.SAXParseException;
import org.xml.sax.helpers.DefaultHandler;

import javax.xml.XMLConstants;
import javax.xml.transform.dom.DOMSource;
import javax.xml.validation.Schema;
import javax.xml.validation.SchemaFactory;
import javax.xml.validation.Validator;
import java.io.StringReader;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

/**
 * Checks OTA messages against the official OpenTravel 2017B schemas (src/main/resources/ota-xsd/2017B, as published by
 * the OpenTravel Alliance), while the system runs. The schemas load once, on first use (about 6 MB).
 *
 * <p>Used by the traffic log for every broker call (report only: the problems are stored with the call and shown in
 * the console, nothing is refused) and by channels set to strict checking (an invalid request gets an OTA error).
 * A message inside a SOAP envelope is checked on its own.
 */
@Component
public class OtaSchemaValidator {

    static final String RELEASE = "2017B";
    private static final int MAX_PROBLEMS = 5;
    private volatile Schema schema;

    /** The ways the OTA message breaks the official schema; empty when it is valid or when it is not an OTA message. */
    public List<String> check(String xml) {
        if (xml == null || xml.isBlank() || xml.length() > OtaRequestParser.MAX_REQUEST_BYTES * 4) return List.of();
        Element ota;
        try {
            var b = OtaRequestParser.secureBuilder();
            b.setErrorHandler(null);
            Document doc = b.parse(new InputSource(new StringReader(xml)));
            ota = otaElement(doc.getDocumentElement());
        } catch (Exception e) {
            return List.of();   // not well-formed: the message itself already answers with an error
        }
        if (ota == null) return List.of();
        if (!OtaXml.OTA_NAMESPACE.equals(ota.getNamespaceURI())) {
            return List.of(ota.getLocalName() + ": not in the OpenTravel namespace " + OtaXml.OTA_NAMESPACE);
        }
        List<String> problems = new ArrayList<>();
        try {
            Validator v = schema().newValidator();
            v.setErrorHandler(new DefaultHandler() {
                @Override public void error(SAXParseException e) { add(problems, e); }
                @Override public void fatalError(SAXParseException e) { add(problems, e); }
            });
            v.validate(new DOMSource(ota));
        } catch (Exception e) {
            if (problems.isEmpty()) problems.add(clean(e.getMessage()));
        }
        return problems;
    }

    private static void add(List<String> problems, SAXParseException e) {
        if (problems.size() < MAX_PROBLEMS) problems.add(clean(e.getMessage()));
    }

    /** Validator texts without the namespace noise, short enough for the console. */
    private static String clean(String message) {
        if (message == null) return "invalid";
        String m = message.replace("{\"" + OtaXml.OTA_NAMESPACE + "\":", "{").replace("\"" + OtaXml.OTA_NAMESPACE + "\":", "")
            .replaceFirst("^cvc-[\\w.-]+: ", "");
        return m.length() > 220 ? m.substring(0, 219) + "…" : m;
    }

    /** The OTA message: the root element, or the first element in a SOAP Body. */
    private static Element otaElement(Element root) {
        if (root == null) return null;
        String name = root.getLocalName() == null ? root.getNodeName() : root.getLocalName();
        if (name.startsWith("OTA_")) return root;
        if (!"Envelope".equals(name)) return null;
        for (Node n = root.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n instanceof Element e && "Body".equals(e.getLocalName())) {
                for (Node c = e.getFirstChild(); c != null; c = c.getNextSibling()) if (c instanceof Element m) return otaElement(m);
            }
        }
        return null;
    }

    private Schema schema() throws Exception {
        Schema s = schema;
        if (s == null) {
            synchronized (this) {
                if (schema == null) {
                    URL all = OtaSchemaValidator.class.getResource("/ota-xsd/" + RELEASE + "/OTA_AllVehicle.xsd");
                    if (all == null) throw new IllegalStateException("Official OpenTravel schemas are missing");
                    SchemaFactory f = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
                    f.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "file,jar,nested");
                    f.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
                    schema = f.newSchema(all);
                }
                s = schema;
            }
        }
        return s;
    }
}
