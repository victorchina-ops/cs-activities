using System;

class Program
{
    static void Main()
    {
        // line comment
        /* block
        comment */ Console.WriteLine("a"); // trailing
        ;;
        Console.WriteLine("b"/* inline */);
        int x = 5 /* c */ + 1;
        Console.WriteLine(x);
    }
}
