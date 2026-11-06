import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ecqhgdpxlrnnfgswxbro.supabase.co';
const supabaseAnonKey = 'sb_publishable_2NMlI-TV8Eb1aMjI_r7ZFQ_w6j0uJo-';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data, error } = await supabase.from('exam_question_progress').select('*').limit(1);
  console.log('exam_question_progress:', data, error);
}

check();

