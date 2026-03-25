
import React from 'react';
import { RatePlan } from '../types';
import { CodeBracketIcon } from './icons';

interface XMLPreviewViewProps {
    currentRatePlans?: RatePlan[];
}

const generateXML = (ratePlans?: RatePlan[]): string => {
    if (!ratePlans || ratePlans.length === 0) {
        return '<!-- No active rate plans to generate -->';
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<OTA_HotelRatePlanNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05">\n  <RatePlans>\n`;
    for (const plan of ratePlans) {
        xml += `    <RatePlan PlanCode="${plan.id}" Start="${plan.startDate}" End="${plan.endDate}">\n`;
        xml += `      <Description Name="${plan.name}" />\n`;
        xml += `      <Rates>\n`;
        for (const sippRate of (plan.sippRates || [])) {
            for (const tier of (sippRate.tiers || [])) {
                const toDay = tier.toDay === Infinity ? '999' : tier.toDay;
                xml += `        <Rate InvTypeCode="${sippRate.sippCode}" CurrencyCode="USD" Amount="${(tier.dailyPrice ?? 0).toFixed(2)}">\n`;
                xml += `           <LengthOfStay Time="${tier.fromDay}" MinMaxMessageType="MinLOS" />\n`;
                xml += `           <LengthOfStay Time="${toDay}" MinMaxMessageType="MaxLOS" />\n`;
                xml += `        </Rate>\n`;
            }
        }
        xml += `      </Rates>\n`;
        xml += `    </RatePlan>\n`;
    }
    xml += `  </RatePlans>\n</OTA_HotelRatePlanNotifRQ>`;
    return xml;
};

const XMLPreviewView: React.FC<XMLPreviewViewProps> = ({ currentRatePlans }) => {
    const xmlContent = generateXML(currentRatePlans);

    return (
        <div className="h-full flex flex-col">
            <div className="mb-4 flex justify-between items-end">
                 <div>
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><CodeBracketIcon /> XML Payload Preview</h3>
                    <p className="text-sm text-slate-500">Live preview of the ARI (Availability, Rates, Inventory) message based on current settings.</p>
                 </div>
                 <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200">OTA_2003_05 Standard</span>
            </div>
            
            <div className="flex-1 bg-slate-900 rounded-xl overflow-hidden shadow-inner border border-slate-700 relative group">
                <div className="absolute top-0 left-0 right-0 bg-slate-800 px-4 py-2 flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
                <pre className="p-6 pt-12 h-full overflow-auto text-xs sm:text-sm font-mono text-green-400 leading-relaxed">
                    <code>{xmlContent}</code>
                </pre>
                <button 
                    onClick={() => navigator.clipboard.writeText(xmlContent)}
                    className="absolute top-2 right-4 text-xs text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    Copy
                </button>
            </div>
        </div>
    );
};

export default XMLPreviewView;
