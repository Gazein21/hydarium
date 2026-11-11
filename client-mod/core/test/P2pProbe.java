import net.hydarium.core.*;

/** Sonde d'intégration (test/p2pbridge.test.js) : le VRAI code du mod (Bridge + P2pAddress) parle au VRAI pont du launcher. */
public class P2pProbe {
    public static void main(String[] a) throws Exception {
        final Bridge b = new Bridge(a[0], a[1]);
        P2pAddress.Opener op = new P2pAddress.Opener() { public int open(String code) throws Exception { return b.openP2p(code); } };
        for (int i = 2; i < a.length; i++) {
            P2pAddress.reset();
            String r = P2pAddress.resolve(a[i], op);
            System.out.println(a[i] + " => " + r + (r == null ? " | " + P2pAddress.lastError : ""));
        }
    }
}
