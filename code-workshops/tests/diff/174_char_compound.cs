using System;

class Program
{
    static void Main()
    {
        char c = 'a';
        c += (char)2;
        c++;
        Console.WriteLine(c);
        c = (char)(c + 1);
        Console.WriteLine(c);
        int i = 'x';
        i += 1;
        Console.WriteLine(i);
        Console.WriteLine("אב \x41 A");
        Console.WriteLine(@"verbatim \n ""q""");
    }
}
