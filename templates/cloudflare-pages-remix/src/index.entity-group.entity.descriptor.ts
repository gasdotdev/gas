import { cloudflarePages } from "@gasdotdev/resources";

export type Env = {};

export const entityGroupEntityDescriptor = cloudflarePages({
	name: "ENTITY_GROUP_ENTITY_DESCRIPTOR",
} as const);

type Cloudflare = Omit<PlatformProxy<Env>, "dispose">;

declare module "@remix-run/cloudflare" {
	interface AppLoadContext {
		cloudflare: Cloudflare;
	}
}

/**
 * The following code is sourced from:
 * https://github.com/cloudflare/workers-sdk/blob/515de6ab40ed6154a2e6579ff90b14b304809609/packages/wrangler/src/dev.tsx
 *
 * Copyright (c) 2020 Cloudflare, Inc. <wrangler@cloudflare.com>
 *
 * Permission is hereby granted, free of charge, to any
 * person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the
 * Software without restriction, including without
 * limitation the rights to use, copy, modify, merge,
 * publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software
 * is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice
 * shall be included in all copies or substantial portions
 * of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
 * ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 * TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
 * SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
 * IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

/**
 * Result of the `getPlatformProxy` utility
 */
export declare type PlatformProxy<
	Env = Record<string, unknown>,
	CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
> = {
	/**
	 * Environment object containing the various Cloudflare bindings
	 */
	env: Env;
	/**
	 * Mock of the context object that Workers received in their request handler, all the object's methods are no-op
	 */
	cf: CfProperties;
	/**
	 * Mock of the context object that Workers received in their request handler, all the object's methods are no-op
	 */
	ctx: ExecutionContext;
	/**
	 * Caches object emulating the Workers Cache runtime API
	 */
	caches: CacheStorage;
	/**
	 * Function used to dispose of the child process providing the bindings implementation
	 */
	dispose: () => Promise<void>;
};

// https://github.com/cloudflare/workerd/blob/main/types/defines/cf.d.ts#L314

/**
 * Request metadata provided by Cloudflare's edge.
 */
type IncomingRequestCfProperties<HostMetadata = unknown> =
	IncomingRequestCfPropertiesBase &
		IncomingRequestCfPropertiesBotManagementEnterprise &
		IncomingRequestCfPropertiesCloudflareForSaaSEnterprise<HostMetadata> &
		IncomingRequestCfPropertiesGeographicInformation &
		IncomingRequestCfPropertiesCloudflareAccessOrApiShield;

interface IncomingRequestCfPropertiesBase extends Record<string, unknown> {
	/**
	 * [ASN](https://www.iana.org/assignments/as-numbers/as-numbers.xhtml) of the incoming request.
	 *
	 * @example 395747
	 */
	asn: number;
	/**
	 * The organization which owns the ASN of the incoming request.
	 *
	 * @example "Google Cloud"
	 */
	asOrganization: string;
	/**
	 * The original value of the `Accept-Encoding` header if Cloudflare modified it.
	 *
	 * @example "gzip, deflate, br"
	 */
	clientAcceptEncoding?: string;
	/**
	 * The number of milliseconds it took for the request to reach your worker.
	 *
	 * @example 22
	 */
	clientTcpRtt?: number;
	/**
	 * The three-letter [IATA](https://en.wikipedia.org/wiki/IATA_airport_code)
	 * airport code of the data center that the request hit.
	 *
	 * @example "DFW"
	 */
	colo: string;
	/**
	 * Represents the upstream's response to a
	 * [TCP `keepalive` message](https://tldp.org/HOWTO/TCP-Keepalive-HOWTO/overview.html)
	 * from cloudflare.
	 *
	 * For workers with no upstream, this will always be `1`.
	 *
	 * @example 3
	 */
	edgeRequestKeepAliveStatus: IncomingRequestCfPropertiesEdgeRequestKeepAliveStatus;
	/**
	 * The HTTP Protocol the request used.
	 *
	 * @example "HTTP/2"
	 */
	httpProtocol: string;
	/**
	 * The browser-requested prioritization information in the request object.
	 *
	 * If no information was set, defaults to the empty string `""`
	 *
	 * @example "weight=192;exclusive=0;group=3;group-weight=127"
	 * @default ""
	 */
	requestPriority: string;
	/**
	 * The TLS version of the connection to Cloudflare.
	 * In requests served over plaintext (without TLS), this property is the empty string `""`.
	 *
	 * @example "TLSv1.3"
	 */
	tlsVersion: string;
	/**
	 * The cipher for the connection to Cloudflare.
	 * In requests served over plaintext (without TLS), this property is the empty string `""`.
	 *
	 * @example "AEAD-AES128-GCM-SHA256"
	 */
	tlsCipher: string;
	/**
	 * Metadata containing the [`HELLO`](https://www.rfc-editor.org/rfc/rfc5246#section-7.4.1.2) and [`FINISHED`](https://www.rfc-editor.org/rfc/rfc5246#section-7.4.9) messages from this request's TLS handshake.
	 *
	 * If the incoming request was served over plaintext (without TLS) this field is undefined.
	 */
	tlsExportedAuthenticator?: IncomingRequestCfPropertiesExportedAuthenticatorMetadata;
}

interface IncomingRequestCfPropertiesBotManagementBase {
	/**
	 * Cloudflare’s [level of certainty](https://developers.cloudflare.com/bots/concepts/bot-score/) that a request comes from a bot,
	 * represented as an integer percentage between `1` (almost certainly a bot) and `99` (almost certainly human).
	 *
	 * @example 54
	 */
	score: number;
	/**
	 * A boolean value that is true if the request comes from a good bot, like Google or Bing.
	 * Most customers choose to allow this traffic. For more details, see [Traffic from known bots](https://developers.cloudflare.com/firewall/known-issues-and-faq/#how-does-firewall-rules-handle-traffic-from-known-bots).
	 */
	verifiedBot: boolean;
	/**
	 * A boolean value that is true if the request originates from a
	 * Cloudflare-verified proxy service.
	 */
	corporateProxy: boolean;
	/**
	 * A boolean value that's true if the request matches [file extensions](https://developers.cloudflare.com/bots/reference/static-resources/) for many types of static resources.
	 */
	staticResource: boolean;
	/**
	 * List of IDs that correlate to the Bot Management heuristic detections made on a request (you can have multiple heuristic detections on the same request).
	 */
	detectionIds: number[];
}

interface IncomingRequestCfPropertiesBotManagement {
	/**
	 * Results of Cloudflare's Bot Management analysis
	 */
	botManagement: IncomingRequestCfPropertiesBotManagementBase;
	/**
	 * Duplicate of `botManagement.score`.
	 *
	 * @deprecated
	 */
	clientTrustScore: number;
}

interface IncomingRequestCfPropertiesBotManagementEnterprise
	extends IncomingRequestCfPropertiesBotManagement {
	/**
	 * Results of Cloudflare's Bot Management analysis
	 */
	botManagement: IncomingRequestCfPropertiesBotManagementBase & {
		/**
		 * A [JA3 Fingerprint](https://developers.cloudflare.com/bots/concepts/ja3-fingerprint/) to help profile specific SSL/TLS clients
		 * across different destination IPs, Ports, and X509 certificates.
		 */
		ja3Hash: string;
	};
}

interface IncomingRequestCfPropertiesCloudflareForSaaSEnterprise<HostMetadata> {
	/**
	 * Custom metadata set per-host in [Cloudflare for SaaS](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/).
	 *
	 * This field is only present if you have Cloudflare for SaaS enabled on your account
	 * and you have followed the [required steps to enable it]((https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/custom-metadata/)).
	 */
	hostMetadata: HostMetadata;
}

interface IncomingRequestCfPropertiesCloudflareAccessOrApiShield {
	/**
	 * Information about the client certificate presented to Cloudflare.
	 *
	 * This is populated when the incoming request is served over TLS using
	 * either Cloudflare Access or API Shield (mTLS)
	 * and the presented SSL certificate has a valid
	 * [Certificate Serial Number](https://ldapwiki.com/wiki/Certificate%20Serial%20Number)
	 * (i.e., not `null` or `""`).
	 *
	 * Otherwise, a set of placeholder values are used.
	 *
	 * The property `certPresented` will be set to `"1"` when
	 * the object is populated (i.e. the above conditions were met).
	 */
	tlsClientAuth:
		| IncomingRequestCfPropertiesTLSClientAuth
		| IncomingRequestCfPropertiesTLSClientAuthPlaceholder;
}

/**
 * Metadata about the request's TLS handshake
 */
interface IncomingRequestCfPropertiesExportedAuthenticatorMetadata {
	/**
	 * The client's [`HELLO` message](https://www.rfc-editor.org/rfc/rfc5246#section-7.4.1.2), encoded in hexadecimal
	 *
	 * @example "44372ba35fa1270921d318f34c12f155dc87b682cf36a790cfaa3ba8737a1b5d"
	 */
	clientHandshake: string;
	/**
	 * The server's [`HELLO` message](https://www.rfc-editor.org/rfc/rfc5246#section-7.4.1.2), encoded in hexadecimal
	 *
	 * @example "44372ba35fa1270921d318f34c12f155dc87b682cf36a790cfaa3ba8737a1b5d"
	 */
	serverHandshake: string;
	/**
	 * The client's [`FINISHED` message](https://www.rfc-editor.org/rfc/rfc5246#section-7.4.9), encoded in hexadecimal
	 *
	 * @example "084ee802fe1348f688220e2a6040a05b2199a761f33cf753abb1b006792d3f8b"
	 */
	clientFinished: string;
	/**
	 * The server's [`FINISHED` message](https://www.rfc-editor.org/rfc/rfc5246#section-7.4.9), encoded in hexadecimal
	 *
	 * @example "084ee802fe1348f688220e2a6040a05b2199a761f33cf753abb1b006792d3f8b"
	 */
	serverFinished: string;
}

/**
 * Geographic data about the request's origin.
 */
interface IncomingRequestCfPropertiesGeographicInformation {
	/**
	 * The [ISO 3166-1 Alpha 2](https://www.iso.org/iso-3166-country-codes.html) country code the request originated from.
	 *
	 * If your worker is [configured to accept TOR connections](https://support.cloudflare.com/hc/en-us/articles/203306930-Understanding-Cloudflare-Tor-support-and-Onion-Routing), this may also be `"T1"`, indicating a request that originated over TOR.
	 *
	 * If Cloudflare is unable to determine where the request originated this property is omitted.
	 *
	 * The country code `"T1"` is used for requests originating on TOR.
	 *
	 * @example "GB"
	 */
	country?: Iso3166Alpha2Code | "T1";
	/**
	 * If present, this property indicates that the request originated in the EU
	 *
	 * @example "1"
	 */
	isEUCountry?: "1";
	/**
	 * A two-letter code indicating the continent the request originated from.
	 *
	 * @example "AN"
	 */
	continent?: ContinentCode;
	/**
	 * The city the request originated from
	 *
	 * @example "Austin"
	 */
	city?: string;
	/**
	 * Postal code of the incoming request
	 *
	 * @example "78701"
	 */
	postalCode?: string;
	/**
	 * Latitude of the incoming request
	 *
	 * @example "30.27130"
	 */
	latitude?: string;
	/**
	 * Longitude of the incoming request
	 *
	 * @example "-97.74260"
	 */
	longitude?: string;
	/**
	 * Timezone of the incoming request
	 *
	 * @example "America/Chicago"
	 */
	timezone?: string;
	/**
	 * If known, the ISO 3166-2 name for the first level region associated with
	 * the IP address of the incoming request
	 *
	 * @example "Texas"
	 */
	region?: string;
	/**
	 * If known, the ISO 3166-2 code for the first-level region associated with
	 * the IP address of the incoming request
	 *
	 * @example "TX"
	 */
	regionCode?: string;
	/**
	 * Metro code (DMA) of the incoming request
	 *
	 * @example "635"
	 */
	metroCode?: string;
}

/** Data about the incoming request's TLS certificate */
interface IncomingRequestCfPropertiesTLSClientAuth {
	/** Always `"1"`, indicating that the certificate was presented */
	certPresented: "1";
	/**
	 * Result of certificate verification.
	 *
	 * @example "FAILED:self signed certificate"
	 */
	certVerified: Exclude<CertVerificationStatus, "NONE">;
	/** The presented certificate's revokation status.
	 *
	 * - A value of `"1"` indicates the certificate has been revoked
	 * - A value of `"0"` indicates the certificate has not been revoked
	 */
	certRevoked: "1" | "0";
	/**
	 * The certificate issuer's [distinguished name](https://knowledge.digicert.com/generalinformation/INFO1745.html)
	 *
	 * @example "CN=cloudflareaccess.com, C=US, ST=Texas, L=Austin, O=Cloudflare"
	 */
	certIssuerDN: string;
	/**
	 * The certificate subject's [distinguished name](https://knowledge.digicert.com/generalinformation/INFO1745.html)
	 *
	 * @example "CN=*.cloudflareaccess.com, C=US, ST=Texas, L=Austin, O=Cloudflare"
	 */
	certSubjectDN: string;
	/**
	 * The certificate issuer's [distinguished name](https://knowledge.digicert.com/generalinformation/INFO1745.html) ([RFC 2253](https://www.rfc-editor.org/rfc/rfc2253.html) formatted)
	 *
	 * @example "CN=cloudflareaccess.com, C=US, ST=Texas, L=Austin, O=Cloudflare"
	 */
	certIssuerDNRFC2253: string;
	/**
	 * The certificate subject's [distinguished name](https://knowledge.digicert.com/generalinformation/INFO1745.html) ([RFC 2253](https://www.rfc-editor.org/rfc/rfc2253.html) formatted)
	 *
	 * @example "CN=*.cloudflareaccess.com, C=US, ST=Texas, L=Austin, O=Cloudflare"
	 */
	certSubjectDNRFC2253: string;
	/** The certificate issuer's distinguished name (legacy policies) */
	certIssuerDNLegacy: string;
	/** The certificate subject's distinguished name (legacy policies) */
	certSubjectDNLegacy: string;
	/**
	 * The certificate's serial number
	 *
	 * @example "00936EACBE07F201DF"
	 */
	certSerial: string;
	/**
	 * The certificate issuer's serial number
	 *
	 * @example "2489002934BDFEA34"
	 */
	certIssuerSerial: string;
	/**
	 * The certificate's Subject Key Identifier
	 *
	 * @example "BB:AF:7E:02:3D:FA:A6:F1:3C:84:8E:AD:EE:38:98:EC:D9:32:32:D4"
	 */
	certSKI: string;
	/**
	 * The certificate issuer's Subject Key Identifier
	 *
	 * @example "BB:AF:7E:02:3D:FA:A6:F1:3C:84:8E:AD:EE:38:98:EC:D9:32:32:D4"
	 */
	certIssuerSKI: string;
	/**
	 * The certificate's SHA-1 fingerprint
	 *
	 * @example "6b9109f323999e52259cda7373ff0b4d26bd232e"
	 */
	certFingerprintSHA1: string;
	/**
	 * The certificate's SHA-256 fingerprint
	 *
	 * @example "acf77cf37b4156a2708e34c4eb755f9b5dbbe5ebb55adfec8f11493438d19e6ad3f157f81fa3b98278453d5652b0c1fd1d71e5695ae4d709803a4d3f39de9dea"
	 */
	certFingerprintSHA256: string;
	/**
	 * The effective starting date of the certificate
	 *
	 * @example "Dec 22 19:39:00 2018 GMT"
	 */
	certNotBefore: string;
	/**
	 * The effective expiration date of the certificate
	 *
	 * @example "Dec 22 19:39:00 2018 GMT"
	 */
	certNotAfter: string;
}

/** Placeholder values for TLS Client Authorization */
interface IncomingRequestCfPropertiesTLSClientAuthPlaceholder {
	certPresented: "0";
	certVerified: "NONE";
	certRevoked: "0";
	certIssuerDN: "";
	certSubjectDN: "";
	certIssuerDNRFC2253: "";
	certSubjectDNRFC2253: "";
	certIssuerDNLegacy: "";
	certSubjectDNLegacy: "";
	certSerial: "";
	certIssuerSerial: "";
	certSKI: "";
	certIssuerSKI: "";
	certFingerprintSHA1: "";
	certFingerprintSHA256: "";
	certNotBefore: "";
	certNotAfter: "";
}

/** Possible outcomes of TLS verification */
declare type CertVerificationStatus =
	/** Authentication succeeded */
	| "SUCCESS"
	/** No certificate was presented */
	| "NONE"
	/** Failed because the certificate was self-signed */
	| "FAILED:self signed certificate"
	/** Failed because the certificate failed a trust chain check */
	| "FAILED:unable to verify the first certificate"
	/** Failed because the certificate not yet valid */
	| "FAILED:certificate is not yet valid"
	/** Failed because the certificate is expired */
	| "FAILED:certificate has expired"
	/** Failed for another unspecified reason */
	| "FAILED";

/**
 * An upstream endpoint's response to a TCP `keepalive` message from Cloudflare.
 */
declare type IncomingRequestCfPropertiesEdgeRequestKeepAliveStatus =
	| 0 /** Unknown */
	| 1 /** no keepalives (not found) */
	| 2 /** no connection re-use, opening keepalive connection failed */
	| 3 /** no connection re-use, keepalive accepted and saved */
	| 4 /** connection re-use, refused by the origin server (`TCP FIN`) */
	| 5; /** connection re-use, accepted by the origin server */

/** ISO 3166-1 Alpha-2 codes */
declare type Iso3166Alpha2Code =
	| "AD"
	| "AE"
	| "AF"
	| "AG"
	| "AI"
	| "AL"
	| "AM"
	| "AO"
	| "AQ"
	| "AR"
	| "AS"
	| "AT"
	| "AU"
	| "AW"
	| "AX"
	| "AZ"
	| "BA"
	| "BB"
	| "BD"
	| "BE"
	| "BF"
	| "BG"
	| "BH"
	| "BI"
	| "BJ"
	| "BL"
	| "BM"
	| "BN"
	| "BO"
	| "BQ"
	| "BR"
	| "BS"
	| "BT"
	| "BV"
	| "BW"
	| "BY"
	| "BZ"
	| "CA"
	| "CC"
	| "CD"
	| "CF"
	| "CG"
	| "CH"
	| "CI"
	| "CK"
	| "CL"
	| "CM"
	| "CN"
	| "CO"
	| "CR"
	| "CU"
	| "CV"
	| "CW"
	| "CX"
	| "CY"
	| "CZ"
	| "DE"
	| "DJ"
	| "DK"
	| "DM"
	| "DO"
	| "DZ"
	| "EC"
	| "EE"
	| "EG"
	| "EH"
	| "ER"
	| "ES"
	| "ET"
	| "FI"
	| "FJ"
	| "FK"
	| "FM"
	| "FO"
	| "FR"
	| "GA"
	| "GB"
	| "GD"
	| "GE"
	| "GF"
	| "GG"
	| "GH"
	| "GI"
	| "GL"
	| "GM"
	| "GN"
	| "GP"
	| "GQ"
	| "GR"
	| "GS"
	| "GT"
	| "GU"
	| "GW"
	| "GY"
	| "HK"
	| "HM"
	| "HN"
	| "HR"
	| "HT"
	| "HU"
	| "ID"
	| "IE"
	| "IL"
	| "IM"
	| "IN"
	| "IO"
	| "IQ"
	| "IR"
	| "IS"
	| "IT"
	| "JE"
	| "JM"
	| "JO"
	| "JP"
	| "KE"
	| "KG"
	| "KH"
	| "KI"
	| "KM"
	| "KN"
	| "KP"
	| "KR"
	| "KW"
	| "KY"
	| "KZ"
	| "LA"
	| "LB"
	| "LC"
	| "LI"
	| "LK"
	| "LR"
	| "LS"
	| "LT"
	| "LU"
	| "LV"
	| "LY"
	| "MA"
	| "MC"
	| "MD"
	| "ME"
	| "MF"
	| "MG"
	| "MH"
	| "MK"
	| "ML"
	| "MM"
	| "MN"
	| "MO"
	| "MP"
	| "MQ"
	| "MR"
	| "MS"
	| "MT"
	| "MU"
	| "MV"
	| "MW"
	| "MX"
	| "MY"
	| "MZ"
	| "NA"
	| "NC"
	| "NE"
	| "NF"
	| "NG"
	| "NI"
	| "NL"
	| "NO"
	| "NP"
	| "NR"
	| "NU"
	| "NZ"
	| "OM"
	| "PA"
	| "PE"
	| "PF"
	| "PG"
	| "PH"
	| "PK"
	| "PL"
	| "PM"
	| "PN"
	| "PR"
	| "PS"
	| "PT"
	| "PW"
	| "PY"
	| "QA"
	| "RE"
	| "RO"
	| "RS"
	| "RU"
	| "RW"
	| "SA"
	| "SB"
	| "SC"
	| "SD"
	| "SE"
	| "SG"
	| "SH"
	| "SI"
	| "SJ"
	| "SK"
	| "SL"
	| "SM"
	| "SN"
	| "SO"
	| "SR"
	| "SS"
	| "ST"
	| "SV"
	| "SX"
	| "SY"
	| "SZ"
	| "TC"
	| "TD"
	| "TF"
	| "TG"
	| "TH"
	| "TJ"
	| "TK"
	| "TL"
	| "TM"
	| "TN"
	| "TO"
	| "TR"
	| "TT"
	| "TV"
	| "TW"
	| "TZ"
	| "UA"
	| "UG"
	| "UM"
	| "US"
	| "UY"
	| "UZ"
	| "VA"
	| "VC"
	| "VE"
	| "VG"
	| "VI"
	| "VN"
	| "VU"
	| "WF"
	| "WS"
	| "YE"
	| "YT"
	| "ZA"
	| "ZM"
	| "ZW";

/** The 2-letter continent codes Cloudflare uses */
declare type ContinentCode = "AF" | "AN" | "AS" | "EU" | "NA" | "OC" | "SA";

/**
 * The following code is sourced from:
 * https://github.com/cloudflare/workers-sdk/blob/00f340f7c1709db777e80a8ea24d245909ff4486/packages/wrangler/src/api/integrations/platform/caches.ts
 *
 * Copyright (c) 2020 Cloudflare, Inc. <wrangler@cloudflare.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice
 * shall be included in all copies or substantial portions
 * of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
 * ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 * TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
 * SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
 * IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

/**
 * Note about this file:
 *
 * Here we are providing a no-op implementation of the runtime Cache API instead of using
 * the miniflare implementation (via `mf.getCaches()`).
 *
 * We are not using miniflare's implementation because that would require the user to provide
 * miniflare-specific Request objects and they would receive back miniflare-specific Response
 * objects, this (in particular the Request part) is not really suitable for `getPlatformProxy`
 * as people would ideally interact with their bindings in a very production-like manner and
 * requiring them to deal with miniflare-specific classes defeats a bit the purpose of the utility.
 *
 * Similarly the Request and Response types here are set to `undefined` as not to use specific ones
 * that would require us to make a choice right now or the user to adapt their code in order to work
 * with the api.
 *
 * We need to find a better/generic manner in which we can reuse the miniflare cache implementation,
 * but until then the no-op implementation below will have to do.
 */

/**
 * No-op implementation of CacheStorage
 */
export class CacheStorage {
	constructor() {
		const unsupportedMethods = ["has", "delete", "keys", "match"];
		unsupportedMethods.forEach((method) => {
			Object.defineProperty(this, method, {
				enumerable: false,
				value: () => {
					throw new Error(
						`Failed to execute '${method}' on 'CacheStorage': the method is not implemented.`,
					);
				},
			});
		});
		Object.defineProperty(this, "default", {
			enumerable: true,
			value: this.default,
		});
	}

	async open(cacheName: string): Promise<Cache> {
		return new Cache();
	}

	get default(): Cache {
		return new Cache();
	}
}

/* eslint-disable @typescript-eslint/no-explicit-any --
   In order to make the API convenient to use in and Node.js programs we try not to
   restrict the types that's why we're using `any`s as the request/response types
   (making this API flexible and compatible with the cache types in `@cloudflare/workers-types`)
*/
type CacheRequest = any;
type CacheResponse = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * No-op implementation of Cache
 */
class Cache {
	async delete(
		request: CacheRequest,
		options?: CacheQueryOptions,
	): Promise<boolean> {
		return false;
	}

	async match(
		request: CacheRequest,
		options?: CacheQueryOptions,
	): Promise<CacheResponse | undefined> {
		return undefined;
	}

	async put(request: CacheRequest, response: CacheResponse): Promise<void> {}
}

type CacheQueryOptions = {
	ignoreMethod?: boolean;
};
