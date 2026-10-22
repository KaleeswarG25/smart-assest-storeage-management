\
        #!/usr/bin/env bash
        set -euo pipefail
        URL="$(terraform output -raw website_url)"
        echo "Checking $URL/health ..."
        for i in $(seq 1 30); do
          if curl --fail --silent --show-error "$URL/health"; then
            echo
            echo "Application is responding."
            exit 0
          fi
          echo "Not ready yet ($i/30); waiting 10 seconds..."
          sleep 10
        done
        echo "Website did not become healthy. Check EC2 cloud-init/user-data logs."
        exit 1
