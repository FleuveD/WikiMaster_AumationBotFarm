const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { execSync } = require('child_process');

const URBAN_VPN_ID = 'eppiocemhmnlbhjplcgkofciiegomcon';
const CRX_URL = `https://clients2.google.com/service/update2/crx?response=redirect&os=win&arch=x86-64&os_arch=x86-64&nacl_arch=x86-64&prod=chromecrx&prodchannel=&prodversion=114.0.5735.199&lang=en-US&acceptformat=crx3&x=id%3D${URBAN_VPN_ID}%26installsource%3Dondemand%26uc`;
const DEST_DIR = path.join(__dirname, 'urbanvpn');

async function downloadAndExtract() {
    console.log("📥 Telechargement de l'extension UrbanVPN...");
    
    // We need adm-zip
    try {
        require.resolve('adm-zip');
    } catch (e) {
        console.log("Installation de adm-zip en cours...");
        execSync('npm install adm-zip', { stdio: 'inherit' });
    }
    const AdmZip = require('adm-zip');

    const crxPath = path.join(__dirname, 'urbanvpn.crx');
    
    // Download CRX
    const response = await axios({
        method: 'get',
        url: CRX_URL,
        responseType: 'arraybuffer'
    });
    
    await fs.writeFile(crxPath, response.data);
    console.log("✅ CRX telecharge !");
    
    console.log("📦 Extraction en cours...");
    await fs.ensureDir(DEST_DIR);
    
    // Un CRX est un fichier ZIP avec une en-tête personnalisée
    // adm-zip peut souvent l'ouvrir directement s'il trouve la signature ZIP
    try {
        const zip = new AdmZip(crxPath);
        zip.extractAllTo(DEST_DIR, true);
        console.log("✅ Extension extraite !");
    } catch (e) {
        // Fallback si adm-zip echoue a cause de l'en-tete CRX (on coupe les 4 premiers octets ou l'en-tete)
        console.log("L'en-tete CRX bloque l'extraction standard. Nettoyage de l'en-tete...");
        const buf = await fs.readFile(crxPath);
        
        let zipBuf = null;
        
        // Verifier la signature Cr24
        if (buf[0] === 0x43 && buf[1] === 0x72 && buf[2] === 0x32 && buf[3] === 0x34) {
            const version = buf.readUInt32LE(4);
            if (version === 2) {
                const publicKeyLength = buf.readUInt32LE(8);
                const signatureLength = buf.readUInt32LE(12);
                zipBuf = buf.slice(16 + publicKeyLength + signatureLength);
            } else if (version === 3) {
                const headerLength = buf.readUInt32LE(8);
                zipBuf = buf.slice(12 + headerLength);
            }
        }
        
        // Fallback ultime : chercher la signature ZIP (PK\x03\x04)
        if (!zipBuf) {
            const zipStart = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
            if (zipStart !== -1) {
                zipBuf = buf.slice(zipStart);
            }
        }

        if (zipBuf) {
            const cleanZipPath = path.join(__dirname, 'urbanvpn_clean.zip');
            await fs.writeFile(cleanZipPath, zipBuf);
            
            const zip = new AdmZip(cleanZipPath);
            zip.extractAllTo(DEST_DIR, true);
            await fs.remove(cleanZipPath);
            console.log("✅ Extension extraite (avec succes) !");
        } else {
            console.error("Erreur: Le fichier telecharge n'est pas un CRX valide.");
            console.error("Contenu brut :", buf.slice(0, 100).toString());
            throw new Error("Impossible de trouver la signature ZIP dans le CRX.");
        }
    }
    
    await fs.remove(crxPath);
    console.log("🎉 UrbanVPN est pret a etre utilise !");
}

downloadAndExtract().catch(console.error);
