<?php

arch('app does not use debugging functions')
    ->expect(['dd', 'dump', 'ray', 'var_dump'])
    ->not->toBeUsed();

arch('app does not access env directly outside config')
    ->expect('env')
    ->not->toBeUsed();
