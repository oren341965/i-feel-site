<?php
declare(strict_types=1);

// The caller stores this payload only with a successful, session-bound lead proof.
// Never expose the original email or accept a client-supplied hash.
function enhanced_conversion_data(array $input): array
{
    if (($input['measurement_consent'] ?? '') !== '1' || !is_string($input['email'] ?? null)) {
        return [];
    }
    $email = strtolower(trim($input['email']));
    if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return [];
    }
    [$local, $domain] = explode('@', $email, 2);
    if (in_array($domain, ['gmail.com', 'googlemail.com'], true)) {
        $local = str_replace('.', '', $local);
    }
    return ['sha256_email_address' => hash('sha256', $local . '@' . $domain)];
}
